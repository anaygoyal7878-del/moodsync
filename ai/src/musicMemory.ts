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
}

function summarize(
  label: string,
  mode: MusicMode,
  sessions: CompletedMusicSession[],
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
 * Sorted by how strongly each moved in its mode's intended direction.
 */
export function rankPlaylistsByEffect(sessions: CompletedMusicSession[]): MusicEffectiveness[] {
  const results: MusicEffectiveness[] = [];
  for (const [mode, modeSessions] of groupBy(sessions, (s) => s.mode)) {
    for (const [name, group] of groupBy(modeSessions, (s) => s.itemName)) {
      const summary = summarize(name, mode as MusicMode, group);
      if (summary) results.push(summary);
    }
  }
  return results.sort((a, b) => effectStrength(b) - effectStrength(a));
}

/** Same grouping by genre rather than by individual playlist — answers
 * "which *kind* of music works" rather than "which playlist". */
export function rankGenresByEffect(sessions: CompletedMusicSession[]): MusicEffectiveness[] {
  const results: MusicEffectiveness[] = [];
  for (const [mode, modeSessions] of groupBy(sessions, (s) => s.mode)) {
    for (const [genre, group] of groupBy(modeSessions, (s) => s.genre)) {
      const summary = summarize(genre, mode as MusicMode, group);
      if (summary) results.push(summary);
    }
  }
  return results.sort((a, b) => effectStrength(b) - effectStrength(a));
}

/** How far the mean moved in the direction the mode wanted. Signed so
 * "helped a lot" sorts above "did nothing" above "went the wrong way". */
function effectStrength(entry: MusicEffectiveness): number {
  const magnitude = Math.abs(entry.meanHeartRateDelta);
  return entry.helped ? magnitude : -magnitude;
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
