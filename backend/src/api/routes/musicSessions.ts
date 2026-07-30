import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { musicSessionRepository, biometricReadingRepository, focusSessionRepository } from '@moodsync/database';
import {
  computeMusicOutcome,
  computeNextNightOutcome,
  computeWellnessScores,
  rankPlaylistsByEffect,
  rankGenresByEffect,
  bestHoursForMode,
  buildMusicRecommendations,
  compareFocusDuration,
  describeFocusDuration,
  musicModeLabel,
  type MusicMode,
  type CompletedMusicSession,
} from '@moodsync/ai';
import { loadCompanionContext, WELLNESS_HISTORY_DAYS } from '../../services/companionContext.js';

const MODES = ['FOCUS', 'RELAX', 'SLEEP', 'RECOVERY', 'MORNING', 'WORKOUT'] as const;
const PROVIDERS = ['APPLE_MUSIC', 'SPOTIFY', 'OTHER'] as const;
const ITEM_KINDS = ['playlist', 'track', 'album', 'station'] as const;

/** How far back the analytics and learning loop look. Long enough to
 * accumulate the 3+ sessions a finding needs, short enough to describe
 * who the user is now. Matches wellnessMemory's window. */
const ANALYTICS_WINDOW_DAYS = 60;

/**
 * Best-effort genre from the item's own name, matched against the same
 * kind of keyword list `MUSIC_CATEGORY_KEYWORDS` uses for playlist
 * matching. Returns null when nothing matches — neither Apple Music nor
 * Spotify exposes a reliable genre for a user's *own* library
 * playlists, so an unmatched name genuinely has no genre rather than a
 * defaultable one.
 */
const GENRE_KEYWORDS: Array<[string, string[]]> = [
  ['Lo-Fi', ['lo-fi', 'lofi', 'chillhop']],
  ['Ambient', ['ambient', 'atmospheric', 'drone', 'soundscape']],
  ['Classical', ['classical', 'piano', 'strings', 'orchestra']],
  ['Jazz', ['jazz', 'bossa', 'swing']],
  ['Nature', ['nature', 'rain', 'forest', 'ocean', 'waves']],
  ['Electronic', ['electronic', 'techno', 'house', 'edm', 'synth']],
  ['Rock', ['rock', 'metal', 'punk', 'indie']],
  ['Hip-Hop', ['hip hop', 'hip-hop', 'rap']],
];

export function inferGenre(itemName: string): string | null {
  const name = itemName.toLowerCase();
  for (const [genre, keywords] of GENRE_KEYWORDS) {
    if (keywords.some((keyword) => name.includes(keyword))) return genre;
  }
  return null;
}

const startSchema = z.object({
  mode: z.enum(MODES),
  provider: z.enum(PROVIDERS),
  itemName: z.string().min(1).max(300),
  itemKind: z.enum(ITEM_KINDS),
  itemExternalId: z.string().max(300).optional(),
});

const completeSchema = z.object({
  /** The client reports whether the user stopped short of the natural
   * end — same client-reported trust model as every other session type
   * in this app. */
  endedEarly: z.boolean().default(false),
});

function hourInZone(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
}

export default async function musicSessionRoutes(app: FastifyInstance) {
  /**
   * Starts a session and snapshots the biometric baseline. The baseline
   * is stored on the row rather than re-derived later so the summary
   * the user sees can't silently change when a wearable back-fills
   * readings for the same window.
   */
  app.post('/music-sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    // An abandoned open session would otherwise block the new one from
    // being the "current" session — close it silently rather than
    // erroring at the user, who did nothing wrong.
    const open = await musicSessionRepository.findOpenSession(userId);
    if (open) {
      await musicSessionRepository.complete(open.id, userId, {
        endedAt: new Date(),
        endedEarly: true,
        outcomeHeartRateDelta: null,
        outcomeStressDelta: null,
        outcomeConfidence: 'insufficient',
        outcomeSummary: 'This session was replaced by a new one before it finished.',
      });
    }

    const context = await loadCompanionContext(userId);
    const session = await musicSessionRepository.start({
      userId,
      mode: parsed.data.mode,
      provider: parsed.data.provider,
      itemName: parsed.data.itemName,
      itemKind: parsed.data.itemKind,
      itemExternalId: parsed.data.itemExternalId ?? null,
      genre: inferGenre(parsed.data.itemName),
      startedAt: new Date(),
      baselineHeartRate: context.latest?.heartRate ?? null,
      baselineStressScore: context.scores?.stress.value ?? null,
      baselineRecoveryScore: context.scores?.recovery.value ?? null,
    });

    return reply.code(201).send({ session });
  });

  /** The session currently playing, so a client that reloaded mid-song
   * reattaches rather than starting a duplicate. */
  app.get('/music-sessions/open', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send({ session: await musicSessionRepository.findOpenSession(request.userId!) });
  });

  /**
   * Ends a session and computes the outcome. This is where the
   * before/during heart-rate comparison actually happens — see
   * ai/src/musicFeedback.ts for what is and isn't measurable.
   */
  app.post('/music-sessions/:id/complete', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = completeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    const existing = await musicSessionRepository.findById(id, userId);
    if (!existing) return reply.code(404).send({ error: 'Music session not found' });
    if (existing.endedAt) return reply.code(409).send({ error: 'This session has already ended' });

    const endedAt = new Date();
    // Samples from the baseline window through the end of the session.
    const windowStart = new Date(existing.startedAt.getTime() - 20 * 60_000);
    const readings = await biometricReadingRepository.listRecentNormalized(userId, 1);
    const samples = readings
      .filter((r) => r.heartRate !== undefined)
      .map((r) => ({ at: new Date(r.timestamp), bpm: r.heartRate! }))
      .filter((s) => s.at >= windowStart && s.at <= endedAt);

    const outcome = computeMusicOutcome(
      { mode: existing.mode as MusicMode, startedAt: existing.startedAt, endedAt, itemName: existing.itemName },
      samples,
    );

    const context = await loadCompanionContext(userId);
    const stressNow = context.scores?.stress.value ?? null;
    const stressDelta =
      existing.baselineStressScore !== null && stressNow !== null ? stressNow - existing.baselineStressScore : null;

    const session = await musicSessionRepository.complete(id, userId, {
      endedAt,
      endedEarly: parsed.data.endedEarly,
      outcomeHeartRateDelta: outcome.heartRateDelta,
      outcomeStressDelta: stressDelta,
      outcomeConfidence: outcome.confidence,
      outcomeSummary: outcome.summary,
    });

    return reply.send({ session, outcome });
  });

  /**
   * The summary card shown right after a session — the stored outcome
   * plus, where it applies, the next-morning follow-up and a
   * recommendation for next time.
   */
  app.get('/music-sessions/:id/summary', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;
    const session = await musicSessionRepository.findById(id, userId);
    if (!session) return reply.code(404).send({ error: 'Music session not found' });

    const context = await loadCompanionContext(userId);
    const baselineSleep = context.history
      .map((r) => computeWellnessScores(r, []).sleep.value)
      .filter((v): v is number => v !== null);

    const nextNight =
      session.endedAt !== null
        ? computeNextNightOutcome({
            mode: session.mode as MusicMode,
            itemName: session.itemName,
            sleepScoreAfter: context.scores?.sleep.value ?? null,
            sleepScoreBaseline:
              baselineSleep.length > 0 ? Math.round(baselineSleep.reduce((s, v) => s + v, 0) / baselineSleep.length) : null,
          })
        : null;

    const completed = await loadCompletedSessions(userId, context.timezone);
    const recommendations = buildMusicRecommendations(completed).filter((r) => r.mode === session.mode);

    return reply.send({ session, nextNight, nextTime: recommendations[0] ?? null });
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/music-sessions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 20, 100);
      return reply.send({ sessions: await musicSessionRepository.listRecent(request.userId!, limit) });
    },
  );

  /**
   * Everything the analytics page renders — effectiveness by playlist
   * and by genre, best hours per mode, the focus-duration comparison,
   * and the personalized recommendations. Computed from stored session
   * outcomes rather than raw biometrics, which is why the outcome is
   * denormalized onto the row (see MusicSession's schema comment).
   */
  app.get('/music-analytics', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const context = await loadCompanionContext(userId);
    const completed = await loadCompletedSessions(userId, context.timezone);

    const focusSessions = await focusSessionRepository.listForUser(userId, 200);
    const focusComparison = compareFocusDuration(
      focusSessions.map((s) => ({ startedAt: s.startedAt, durationMinutes: s.durationMinutes })),
      completed,
    );

    const modesPresent = [...new Set(completed.map((s) => s.mode))];

    return reply.send({
      windowDays: ANALYTICS_WINDOW_DAYS,
      historyDays: WELLNESS_HISTORY_DAYS,
      totalSessions: completed.length,
      playlists: rankPlaylistsByEffect(completed),
      genres: rankGenresByEffect(completed),
      bestHours: modesPresent.map((mode) => ({ mode, label: musicModeLabel(mode), hours: bestHoursForMode(completed, mode) })),
      recommendations: buildMusicRecommendations(completed),
      focusDuration: focusComparison
        ? { ...focusComparison, sentence: describeFocusDuration(focusComparison) }
        : null,
    });
  });
}

/** Shared loader: completed sessions in the analytics window, mapped
 * into the shape ai/src/musicMemory.ts consumes (timezone-local hour
 * included, since the AI layer never does timezone work itself). */
async function loadCompletedSessions(userId: string, timezone: string): Promise<CompletedMusicSession[]> {
  const rows = await musicSessionRepository.listCompletedSince(userId, ANALYTICS_WINDOW_DAYS);
  return rows.map((row) => ({
    mode: row.mode as MusicMode,
    itemName: row.itemName,
    genre: row.genre,
    startedAt: row.startedAt,
    endedAt: row.endedAt!,
    heartRateDelta: row.outcomeHeartRateDelta,
    endedEarly: row.endedEarly,
    hourOfDay: hourInZone(row.startedAt, timezone),
  }));
}
