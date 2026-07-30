import {
  biometricReadingRepository,
  calendarConnectionRepository,
  caffeineLogRepository,
  userTimezoneRepository,
} from '@moodsync/database';
import { computeWellnessScores, computeLiveEnergyMeter, type WellnessScores } from '@moodsync/ai';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { calendarService } from './calendarService.js';

/**
 * The shared read every companion surface needs — the Daily Brief,
 * Energy, Sleep, Recovery and the burnout/study-plan checks all want the
 * same handful of things (latest reading, trailing history, computed
 * scores, today's calendar). Loading it once here keeps those routes
 * from each re-deriving it slightly differently, which is how the
 * burnout and study-plan routes had already started to drift.
 */

/** Same trailing window `computeWellnessScores` needs for its
 * own-baseline z-scoring, used consistently across every caller. */
export const WELLNESS_HISTORY_DAYS = 30;
/** Matches the Live Energy Meter's caffeine decay window. */
const CAFFEINE_WINDOW_HOURS = 5;

export interface CompanionContext {
  latest: NormalizedBiometricReading | null;
  /** Trailing readings, newest first, excluding `latest` itself. */
  history: NormalizedBiometricReading[];
  scores: WellnessScores | null;
  /** Live composite energy including any recent caffeine, or null when
   * there's no biometric basis for one. */
  energy: number | null;
  /** Today's timed calendar events. `null` (not `[]`) when no calendar
   * is connected — callers must keep "no calendar" distinct from
   * "a genuinely free day." */
  todayEvents: Array<{ title: string; start: Date; end: Date }> | null;
  timezone: string;
}

/** Baseline values across the trailing window, for the "what changed
 * overnight" comparison — each metric's mean over prior readings. */
export interface WellnessBaseline {
  sleep: number | null;
  recovery: number | null;
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export async function loadCompanionContext(userId: string): Promise<CompanionContext> {
  const [latestRow, timezone] = await Promise.all([
    biometricReadingRepository.findLatestNormalized(userId),
    userTimezoneRepository.getTimezone(userId),
  ]);

  const history = latestRow
    ? (await biometricReadingRepository.listRecentNormalized(userId, WELLNESS_HISTORY_DAYS)).filter(
        (r) => r.timestamp !== latestRow.reading.timestamp,
      )
    : [];

  const scores = latestRow ? computeWellnessScores(latestRow.reading, history) : null;

  let energy: number | null = null;
  if (scores) {
    const caffeineLogs = await caffeineLogRepository.listRecentForUser(userId, CAFFEINE_WINDOW_HOURS);
    energy = computeLiveEnergyMeter(
      scores,
      caffeineLogs.map((log) => ({ mg: log.mg, loggedAt: log.loggedAt })),
    ).value;
  }

  return {
    latest: latestRow?.reading ?? null,
    history,
    scores,
    energy,
    todayEvents: await loadTodayEvents(userId),
    timezone,
  };
}

/**
 * Today's timed calendar events, or `null` when the user has no active
 * calendar connection. A failed read (expired token, Google outage) also
 * returns `null` rather than an empty array — "we couldn't look" and
 * "nothing is scheduled" must not be conflated, since several callers
 * treat an empty day as a positive signal.
 */
export async function loadTodayEvents(userId: string): Promise<Array<{ title: string; start: Date; end: Date }> | null> {
  const connection = await calendarConnectionRepository.findByUser(userId);
  if (!connection || connection.status !== 'ACTIVE') return null;

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const events = await calendarService.listUpcomingEvents(userId, startOfDay, endOfDay);
    return events.filter((e) => !e.isAllDay).map((e) => ({ title: e.title, start: e.start, end: e.end }));
  } catch {
    return null;
  }
}

/** The user's first timed commitment tomorrow — what the Sleep Coach's
 * bedtime target works backwards from. Null when no calendar is
 * connected or tomorrow is genuinely clear. */
export async function loadFirstCommitmentTomorrow(userId: string): Promise<Date | null> {
  const connection = await calendarConnectionRepository.findByUser(userId);
  if (!connection || connection.status !== 'ACTIVE') return null;

  try {
    const now = new Date();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
    const events = await calendarService.listUpcomingEvents(userId, tomorrowStart, tomorrowEnd);
    const timed = events.filter((e) => !e.isAllDay).sort((a, b) => a.start.getTime() - b.start.getTime());
    return timed[0]?.start ?? null;
  } catch {
    return null;
  }
}

/** Hours of timed calendar time booked today, or null with no calendar. */
export function bookedHoursFrom(events: CompanionContext['todayEvents']): number | null {
  if (events === null) return null;
  const ms = events.reduce((sum, e) => sum + Math.max(0, e.end.getTime() - e.start.getTime()), 0);
  return Number((ms / 3_600_000).toFixed(1));
}

/** Trailing means for the metrics the overnight comparison uses. Each
 * reading is scored against an empty history deliberately — a per-night
 * passthrough score (which is what sleep and provider-native recovery
 * are) doesn't need a baseline, and passing the full history per reading
 * would be O(n²) over a 30-day window for no gain. */
export function computeWellnessBaseline(history: NormalizedBiometricReading[]): WellnessBaseline {
  const scored = history.map((reading) => computeWellnessScores(reading, []));
  return {
    sleep: meanOrNull(scored.map((s) => s.sleep.value).filter((v): v is number => v !== null)),
    recovery: meanOrNull(scored.map((s) => s.recovery.value).filter((v): v is number => v !== null)),
  };
}

/** Own-baseline z-score helper — the same technique wellness.ts uses
 * internally but doesn't export. Needs 5+ points, same as there. */
export function baselineZ(latest: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
  const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (history.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (latest - mean) / sd;
}
