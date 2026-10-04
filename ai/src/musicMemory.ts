import { hourInZone } from '@moodsync/shared';
import { modeWantsLowerHeartRate, musicModeLabel, type MusicMode } from './musicFeedback.js';

/**
 * The learning half of the music feedback loop — what MoodSync has
 * worked out about which music helps *this* user, from their own
 * completed sessions.
 *
 * Same discipline as ai/src/wellnessMemory.ts: nothing is claimed until
 * there are enough sessions behind it, and every claim ships the sample
 * size so "Lo-Fi helps you focus" can't be read as a law when it's
 * three afternoons.
 */

export interface CompletedMusicSession {
  mode: MusicMode;
  itemName: string;
  genre: string | null;
  startedAt: Date;
  endedAt: Date;
  /** Signed bpm change, negative = came down. Null when the session's
   * outcome was `insufficient`. */
  heartRateDelta: number | null;
  endedEarly: boolean;
  /** Hour of day in the user's own timezone — the caller converts,
   * matching the convention in proactiveNotifications.ts. */
  hourOfDay: number;
}

/** The stored columns the learning loop reads — structural, so this
 * module stays free of a Prisma dependency while still being checked
 * against the real row shape at every call site. */
export interface MusicSessionRowLike {
  mode: string;
  itemName: string;
  genre: string | null;
  startedAt: Date;
  endedAt: Date | null;
  outcomeHeartRateDelta: number | null;
  endedEarly: boolean;
}

/**
 * The one place a stored music session becomes a `CompletedMusicSession`.
 *
 * Exists because of a bug: the playlist resolver cast database rows
 * straight to this type, but the column is `outcomeHeartRateDelta`, not
 * `heartRateDelta`. Every delta read as `undefined`, which passes a
 * `!== null` check, so every mean was NaN, nothing ever counted as
 * having helped, and "play what has worked for you" silently never
 * fired. Two other callers mapped by hand and were fine. One mapper,
 * typed against the row, makes that unrepresentable.
 *
 * Sessions still in progress are dropped — they have no outcome yet.
 */
export function toCompletedMusicSessions(rows: MusicSessionRowLike[], timezone: string): CompletedMusicSession[] {
  return rows
    .filter((row): row is MusicSessionRowLike & { endedAt: Date } => row.endedAt !== null)
    .map((row) => ({
      mode: row.mode as MusicMode,
      itemName: row.itemName,
      genre: row.genre,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      heartRateDelta: row.outcomeHeartRateDelta,
      endedEarly: row.endedEarly,
      hourOfDay: hourInZone(row.startedAt, timezone),
    }));
}

/** Below this many sessions, a "finding" is a coincidence. Matches
 * wellnessMemory.ts's threshold deliberately — the bar for telling
 * someone something works for them should be the same everywhere. */
const MIN_SESSIONS_FOR_FINDING = 3;
/** An hour bucket needs at least this many sessions to be called a
 * pattern. */
const MIN_SESSIONS_PER_HOUR = 2;
/** Above this share of early stops, a playlist is flagged as one the
 * user doesn't actually stay with. */
const HIGH_SKIP_RATE = 0.5;

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface MusicEffectiveness {
  /** Playlist/track name, or genre, depending on which grouping this
   * came from. */
  label: string;
  mode: MusicMode;
  sessions: number;
  /** Mean signed bpm change across those sessions. */
  meanHeartRateDelta: number;
  /** True when the mean moved in the direction this mode wants. */
  helped: boolean;
  /** Share of sessions the user stopped early, 0-1. */
  earlyStopRate: number;
  /** What the ranking sorts by: the effect in the mode's intended
   * direction, discounted for thin evidence, age and abandonment. Not
   * shown to users — `meanHeartRateDelta` is the honest measured number
   * for display; this is only the order. See `rankingScore`. */
  score: number;
}

/**
 * Pseudo-sessions of "no effect" every playlist starts with.
 *
 * Ranking by raw mean lets three lucky sessions at −8 bpm beat thirty
 * consistent ones at −6. Shrinking toward zero — a sceptical prior of
 * "this playlist does nothing special" — means a small sample has to
 * be striking to rank high, while a large one ranks on its merits.
 * Three matches MIN_SESSIONS_FOR_FINDING: at the threshold a finding
 * counts at half strength.
 */
const PRIOR_SESSIONS = 3;

/** Half-life for a session's weight. Taste and context drift — what
 * settled someone in spring may not in autumn — so recent sessions
 * count more, without old ones ever counting for nothing. */
const RECENCY_HALF_LIFE_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * The ranking score for a group of sessions, in bpm-equivalent units.
 *
 *     directional effect × completion rate
 *
 * - Directional effect: recency-weighted mean delta, shrunk toward zero
 *   by PRIOR_SESSIONS, and signed so moving the way the mode wants is
 *   positive.
 * - Completion rate: a playlist people stop halfway through is not
 *   working for them, whatever their heart rate did in the minutes they
 *   stayed. Only applied to a positive effect — multiplying a negative
 *   one would make abandoning a bad playlist *improve* its score.
 *
 * Exported for tests; deterministic given `now`.
 */
export function rankingScore(mode: MusicMode, sessions: CompletedMusicSession[], now: Date): number {
  const measured = sessions.filter((s) => s.heartRateDelta !== null);
  if (measured.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of measured) {
    const ageDays = Math.max(0, (now.getTime() - s.endedAt.getTime()) / DAY_MS);
    const weight = 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
    weightedSum += weight * s.heartRateDelta!;
    weightTotal += weight;
  }
  // Prior weight scales with the data's own weighting, so a playlist
  // whose sessions are all old is also held to a sceptical prior,
  // rather than being shrunk less because its weights are small.
  const meanWeight = weightTotal / measured.length;
  const shrunk = weightedSum / (weightTotal + PRIOR_SESSIONS * meanWeight);

  const directional = modeWantsLowerHeartRate(mode) ? -shrunk : shrunk;
  const completion = 1 - sessions.filter((s) => s.endedEarly).length / sessions.length;
  return directional > 0 ? directional * completion : directional;
}

function summarize(
  label: string,
  mode: MusicMode,
  sessions: CompletedMusicSession[],
  now: Date,
): MusicEffectiveness | null {
  const measured = sessions.filter((s) => s.heartRateDelta !== null);
  if (measured.length < MIN_SESSIONS_FOR_FINDING) return null;

  const meanDelta = Math.round(mean(measured.map((s) => s.heartRateDelta!)));
  const wantsLower = modeWantsLowerHeartRate(mode);
  return {
    label,
    mode,
    sessions: measured.length,
    meanHeartRateDelta: meanDelta,
    helped: wantsLower ? meanDelta < 0 : meanDelta > 0,
    earlyStopRate: sessions.filter((s) => s.endedEarly).length / sessions.length,
    score: Math.round(rankingScore(mode, sessions, now) * 100) / 100,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const existing = map.get(k) ?? [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}

/**
 * Effectiveness per playlist within each mode. Grouped by mode as well
 * as name because the same playlist can be a good Focus soundtrack and
 * a bad Sleep one — collapsing them would average away the thing the
 * user actually wants to know.
 *
 * Sorted by `score` — effect in the intended direction, weighed by how
 * much recent evidence backs it and whether the person stays with it.
 */
export function rankPlaylistsByEffect(sessions: CompletedMusicSession[], now: Date = new Date()): MusicEffectiveness[] {
  const results: MusicEffectiveness[] = [];
  for (const [mode, modeSessions] of groupBy(sessions, (s) => s.mode)) {
    for (const [name, group] of groupBy(modeSessions, (s) => s.itemName)) {
      const summary = summarize(name, mode as MusicMode, group, now);
      if (summary) results.push(summary);
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Same grouping by genre rather than by individual playlist — answers
 * "which *kind* of music works" rather than "which playlist". */
export function rankGenresByEffect(sessions: CompletedMusicSession[], now: Date = new Date()): MusicEffectiveness[] {
  const results: MusicEffectiveness[] = [];
  for (const [mode, modeSessions] of groupBy(sessions, (s) => s.mode)) {
    for (const [genre, group] of groupBy(modeSessions, (s) => s.genre)) {
      const summary = summarize(genre, mode as MusicMode, group, now);
      if (summary) results.push(summary);
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

export interface HourPattern {
  mode: MusicMode;
  hourOfDay: number;
  sessions: number;
  meanHeartRateDelta: number;
}

/** Which hours of the day a given mode has actually worked best in. */
export function bestHoursForMode(sessions: CompletedMusicSession[], mode: MusicMode): HourPattern[] {
  const modeSessions = sessions.filter((s) => s.mode === mode && s.heartRateDelta !== null);
  const results: HourPattern[] = [];

  for (const [hour, group] of groupBy(modeSessions, (s) => String(s.hourOfDay))) {
    if (group.length < MIN_SESSIONS_PER_HOUR) continue;
    results.push({
      mode,
      hourOfDay: Number(hour),
      sessions: group.length,
      meanHeartRateDelta: Math.round(mean(group.map((s) => s.heartRateDelta!))),
    });
  }

  const wantsLower = modeWantsLowerHeartRate(mode);
  return results.sort((a, b) =>
    wantsLower ? a.meanHeartRateDelta - b.meanHeartRateDelta : b.meanHeartRateDelta - a.meanHeartRateDelta,
  );
}

export interface MusicRecommendation {
  /** The sentence shown to the user. */
  text: string;
  mode: MusicMode;
  /** How many sessions back this. Always surfaced. */
  sessions: number;
}

function hourRangeLabel(hour: number): string {
  const end = (hour + 2) % 24;
  return `${hour.toString().padStart(2, '0')}:00–${end.toString().padStart(2, '0')}:00`;
}

/**
 * Turns the rankings above into the handful of sentences worth showing.
 *
 * Deliberately conservative: at most one recommendation per mode, only
 * where the effect actually went the mode's way, plus a "you don't stay
 * with this one" note where the early-stop rate is high enough to be
 * worth saying. An empty array is a perfectly good answer for a new
 * user, and the UI says so.
 */
export function buildMusicRecommendations(sessions: CompletedMusicSession[]): MusicRecommendation[] {
  const recommendations: MusicRecommendation[] = [];
  const byPlaylist = rankPlaylistsByEffect(sessions);

  const seenModes = new Set<MusicMode>();
  for (const entry of byPlaylist) {
    if (!entry.helped || seenModes.has(entry.mode)) continue;
    seenModes.add(entry.mode);

    const hours = bestHoursForMode(sessions, entry.mode);
    const bestHour = hours[0];
    const modeLabel = musicModeLabel(entry.mode).toLowerCase();

    recommendations.push({
      mode: entry.mode,
      sessions: entry.sessions,
      text: bestHour
        ? `You ${entry.mode === 'WORKOUT' || entry.mode === 'MORNING' ? 'lift best' : 'settle best'} with "${entry.label}" for ${modeLabel} around ${hourRangeLabel(bestHour.hourOfDay)}.`
        : `"${entry.label}" is your strongest ${modeLabel} soundtrack so far.`,
    });
  }

  const abandoned = byPlaylist.find((entry) => entry.earlyStopRate > HIGH_SKIP_RATE);
  if (abandoned) {
    recommendations.push({
      mode: abandoned.mode,
      sessions: abandoned.sessions,
      text: `You stop "${abandoned.label}" early more often than not — it may not be the right fit for ${musicModeLabel(abandoned.mode).toLowerCase()}.`,
    });
  }

  return recommendations;
}

/**
 * The cross-session focus-duration comparison the brief asked for
 * ("you stayed focused 22 minutes longer with Lo-Fi").
 *
 * Compares mean completed focus-session length when a given playlist
 * was playing against mean length with no music session running.
 * Returns null unless both sides clear the sample threshold — this is
 * the claim most likely to be read as fact, so it gets the strictest
 * gate.
 */
export interface FocusDurationComparison {
  label: string;
  withMusicMinutes: number;
  withoutMusicMinutes: number;
  differenceMinutes: number;
  sessionsWithMusic: number;
  sessionsWithoutMusic: number;
}

export function compareFocusDuration(
  focusSessions: Array<{ startedAt: Date; durationMinutes: number }>,
  musicSessions: CompletedMusicSession[],
): FocusDurationComparison | null {
  const musicFocus = musicSessions.filter((s) => s.mode === 'FOCUS');
  if (musicFocus.length === 0) return null;

  /** A focus session counts as "with music" when a FOCUS-mode music
   * session was open at the moment it started. */
  function musicPlayingAt(at: Date): CompletedMusicSession | undefined {
    return musicFocus.find((m) => at >= m.startedAt && at <= m.endedAt);
  }

  const withMusic = new Map<string, number[]>();
  const withoutMusic: number[] = [];

  for (const focus of focusSessions) {
    const music = musicPlayingAt(focus.startedAt);
    if (music) {
      const existing = withMusic.get(music.itemName) ?? [];
      existing.push(focus.durationMinutes);
      withMusic.set(music.itemName, existing);
    } else {
      withoutMusic.push(focus.durationMinutes);
    }
  }

  if (withoutMusic.length < MIN_SESSIONS_FOR_FINDING) return null;

  let best: FocusDurationComparison | null = null;
  const baseline = mean(withoutMusic);

  for (const [label, durations] of withMusic) {
    if (durations.length < MIN_SESSIONS_FOR_FINDING) continue;
    const withMean = mean(durations);
    const difference = Math.round(withMean - baseline);
    if (best === null || difference > best.differenceMinutes) {
      best = {
        label,
        withMusicMinutes: Math.round(withMean),
        withoutMusicMinutes: Math.round(baseline),
        differenceMinutes: difference,
        sessionsWithMusic: durations.length,
        sessionsWithoutMusic: withoutMusic.length,
      };
    }
  }

  return best;
}

/** The sentence form of a focus-duration comparison. Phrased as an
 * association, and only ever positive — a playlist that happens to
 * correlate with shorter sessions isn't evidence it hurt focus, so this
 * returns null rather than saying so. */
export function describeFocusDuration(comparison: FocusDurationComparison): string | null {
  if (comparison.differenceMinutes <= 0) return null;
  return `You stayed focused ${comparison.differenceMinutes} minutes longer with "${comparison.label}" (${comparison.sessionsWithMusic} sessions vs. ${comparison.sessionsWithoutMusic} without music).`;
}
