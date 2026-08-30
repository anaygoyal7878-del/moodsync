import {
  biometricReadingRepository,
  meditationSessionRepository,
  focusSessionRepository,
  musicSessionRepository,
} from '@moodsync/database';
import { computeWellnessScores } from './wellness.js';
import { computePersonalBaselines } from './personalBaselines.js';
import { detectHealthScenarios } from './healthScenarios.js';
import { correlateOccurrences } from './wellnessMemory.js';
import { rankPlaylistsByEffect, type CompletedMusicSession } from './musicMemory.js';
import { buildIntelligenceStack, type IntelligenceStackResult } from './intelligenceStack.js';

/**
 * Loads the whole intelligence stack for one user.
 *
 * The impure counterpart to `intelligenceStack.ts`: this does the
 * querying, that does the arranging. It exists so the stack is loadable
 * from anywhere rather than being reassembled at each call site — the
 * `/wellness-memory` route had already grown its own copy of the
 * occurrence-building logic, and Clara's prompt was about to grow a
 * second one. Two copies of "what does MoodSync know about this person"
 * is how they start disagreeing.
 *
 * `MEMORY_WINDOW_DAYS` matches the wellness-memory route's window, so
 * the correlations Clara reasons from are the same ones the Recovery
 * page shows the user. An assistant citing different numbers than the
 * screen next to it is worse than one that cites none.
 */
const MEMORY_WINDOW_DAYS = 30;
const BASELINE_HISTORY_DAYS = 30;
const SESSION_LIMIT = 200;

export async function loadIntelligenceStack(userId: string): Promise<IntelligenceStackResult> {
  const [readings, meditations, focusSessions, musicSessions] = await Promise.all([
    biometricReadingRepository.listRecentNormalized(userId, BASELINE_HISTORY_DAYS),
    meditationSessionRepository.listForUser(userId, SESSION_LIMIT),
    focusSessionRepository.listForUser(userId, SESSION_LIMIT),
    musicSessionRepository.listCompletedSince(userId, MEMORY_WINDOW_DAYS),
  ]);

  const latest = readings[0];
  // Baselines exclude the reading being compared, so today's value is
  // never measured against a mean it just moved.
  const baselines = latest ? computePersonalBaselines(latest, readings.slice(1)) : null;
  const scenarios = baselines ? detectHealthScenarios(baselines) : [];

  const recoveryPoints = readings
    .map((reading) => {
      const value = computeWellnessScores(reading, []).recovery.value;
      return value === null ? null : { at: new Date(reading.timestamp), value };
    })
    .filter((p): p is { at: Date; value: number } => p !== null);

  const occurrences = [
    ...meditations.map((m) => ({ at: m.completedAt, label: 'Meditation' })),
    ...focusSessions.map((f) => ({ at: f.completedAt, label: 'Focus session' })),
  ];

  const findings = correlateOccurrences(occurrences, recoveryPoints);

  // Mapped the same way `loadCompletedSessions` in the music-sessions
  // route does, minus the timezone conversion: `hourOfDay` only feeds
  // `bestHoursForMode`, which this stack does not use, so requiring a
  // timezone lookup here would be a query for a field nobody reads.
  const completed: CompletedMusicSession[] = musicSessions
    .filter((row) => row.endedAt !== null)
    .map((row) => ({
      mode: row.mode as CompletedMusicSession['mode'],
      itemName: row.itemName,
      genre: row.genre,
      startedAt: row.startedAt,
      endedAt: row.endedAt!,
      heartRateDelta: row.outcomeHeartRateDelta,
      endedEarly: row.endedEarly,
      hourOfDay: 0,
    }));

  return buildIntelligenceStack({
    readingCount: readings.length,
    baselines,
    scenarios,
    findings,
    musicEffects: rankPlaylistsByEffect(completed),
  });
}
