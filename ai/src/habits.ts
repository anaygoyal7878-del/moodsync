import type { NormalizedBiometricReading } from '@moodsync/shared';

/** MoodSync's own engineering threshold for "counted as a walking day,"
 * same status as `STEPS_FOR_FULL_ACTIVITY` in
 * integrations/fitbit/src/normalize.ts (10,000) — this one is
 * deliberately lower (8,000) since a *habit* threshold ("did you walk
 * today") is a different bar than a *full activity score*, not a
 * clinical recommendation either way. */
const WALKING_STEPS_THRESHOLD = 8_000;

/** How far back "current streak" and "consistency %" look — 30 days is
 * long enough to show a real pattern, short enough that a habit started
 * last month isn't diluted by a permanent full-history denominator. */
const STREAK_WINDOW_DAYS = 30;

export interface HabitStreakResult {
  habit: 'walking' | 'meditation' | 'focus';
  /** Consecutive days (ending at `asOf`, or the most recent day with
   * data if `asOf` itself has none yet) where the habit was met. 0 if
   * not met yesterday/today, even with a long streak further back —
   * a streak is about *now*, not ever having done it for a while. */
  currentStreakDays: number;
  /** % of the last `STREAK_WINDOW_DAYS` days the habit was met — null
   * when there's no reading/session data at all in the window (distinct
   * from a real, computed 0%). */
  consistencyPct: number | null;
  /** YYYY-MM-DD (UTC) of the most recent day the habit was met, or null
   * if never met within the window. */
  lastMetDate: string | null;
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number, from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** Shared streak/consistency computation over a `Set` of "met" day keys
 * — both `computeWalkingStreak` and `computeMeditationStreak` reduce
 * their own data source down to this same shape first, so the
 * streak-counting logic itself can't drift between the two habits. */
function computeFromMetDays(metDays: Set<string>, habit: HabitStreakResult['habit'], asOf: Date): HabitStreakResult {
  if (metDays.size === 0) {
    return { habit, currentStreakDays: 0, consistencyPct: null, lastMetDate: null };
  }

  let currentStreakDays = 0;
  // A streak "counting as current" tolerates today not being met yet
  // (the day isn't over) by starting the backward walk from yesterday
  // if today itself isn't met — otherwise a real ongoing streak would
  // show as 0 every day until the user's last sync of the day lands.
  let cursor = metDays.has(utcDayKey(asOf)) ? asOf : daysAgo(1, asOf);
  while (metDays.has(utcDayKey(cursor))) {
    currentStreakDays++;
    cursor = daysAgo(1, cursor);
  }

  let metInWindow = 0;
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    if (metDays.has(utcDayKey(daysAgo(i, asOf)))) metInWindow++;
  }
  const consistencyPct = Math.round((metInWindow / STREAK_WINDOW_DAYS) * 100);

  const lastMetDate = [...metDays].sort().at(-1)!;

  return { habit, currentStreakDays, consistencyPct, lastMetDate };
}

/** Buckets readings by UTC day and takes the **max** steps value seen
 * per day, not a sum — Fitbit/Google Health's daily steps rollup is
 * already a cumulative day total re-inserted (with a growing value)
 * throughout the day as the sync worker polls, so summing would
 * massively over-count. Same "max of a repeatedly re-synced cumulative
 * value" reasoning as reading any provider's daily rollup elsewhere in
 * this codebase. */
export function computeWalkingStreak(readings: NormalizedBiometricReading[], asOf: Date = new Date()): HabitStreakResult {
  const maxStepsByDay = new Map<string, number>();
  for (const reading of readings) {
    if (reading.steps === undefined) continue;
    const key = utcDayKey(new Date(reading.timestamp));
    maxStepsByDay.set(key, Math.max(maxStepsByDay.get(key) ?? 0, reading.steps));
  }

  const metDays = new Set<string>();
  for (const [day, steps] of maxStepsByDay) {
    if (steps >= WALKING_STEPS_THRESHOLD) metDays.add(day);
  }

  return computeFromMetDays(metDays, 'walking', asOf);
}

/** A day is "met" if at least one `MeditationSession` completed on it —
 * no minimum duration required, matching the product's own framing
 * ("Meditation" as a habit to check off, not a quota to hit). */
export function computeMeditationStreak(sessions: { completedAt: Date }[], asOf: Date = new Date()): HabitStreakResult {
  const metDays = new Set(sessions.map((s) => utcDayKey(s.completedAt)));
  return computeFromMetDays(metDays, 'meditation', asOf);
}

/** A day is "met" if at least one Focus Session was completed on it —
 * the third habit with a real signal behind it, added once Focus
 * Sessions started being logged. Same "did you do it" framing as
 * meditation: no minimum duration, since the session already has one. */
export function computeFocusStreak(sessions: { completedAt: Date }[], asOf: Date = new Date()): HabitStreakResult {
  const metDays = new Set(sessions.map((s) => utcDayKey(s.completedAt)));
  return computeFromMetDays(metDays, 'focus', asOf);
}
