import { plannedWorkoutRepository, userTimezoneRepository, type WorkoutKind } from '@moodsync/database';
import { hourInZone } from '@moodsync/shared';

/**
 * Planned workouts, and the timezone arithmetic that makes "today" mean
 * the user's today.
 *
 * `scheduledFor` is stored at UTC midnight standing for a local
 * calendar date. That choice is what keeps "legs on Thursday" stable:
 * storing a real instant would move the workout across a day boundary
 * for anyone east or west of the server, and someone in Auckland would
 * see Thursday's session appear on Wednesday.
 *
 * The conversion happens in exactly two places — `localDayStart` on the
 * way in and `startOfLocalDayUtc` on the way out — so there is one
 * definition of a day rather than one per call site.
 */

/** Parses a `YYYY-MM-DD` date into the UTC-midnight instant that stands
 * for that local date. Rejects anything else rather than letting
 * `new Date()` silently accept a format it guesses at. */
export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The UTC-midnight instant standing for the user's current local date.
 * Derived from their timezone's wall-clock hour, not the server's. */
export function startOfLocalDayUtc(now: Date, timezone: string): Date {
  const localHour = hourInZone(now, timezone);
  // Shift the instant to the user's wall clock, then truncate. Going
  // through the hour offset rather than a date-string parse keeps this
  // working across DST transitions, where the offset is not constant.
  const utcHour = now.getUTCHours();
  let offsetHours = localHour - utcHour;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;

  const shifted = new Date(now.getTime() + offsetHours * 60 * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Minutes past local midnight, for reminder timing. */
export function localMinutesNow(now: Date, timezone: string): number {
  return hourInZone(now, timezone) * 60 + now.getUTCMinutes();
}

export interface CreateWorkoutRequest {
  scheduledFor: string;
  kind: WorkoutKind;
  title: string;
  // `| undefined` is explicit because the repo runs
  // `exactOptionalPropertyTypes`: under it, `?:` means "may be absent",
  // not "may be undefined", and a zod-parsed optional produces the
  // latter. Spelling both out is what lets the route hand its parsed
  // body straight through without a re-shaping step.
  plannedMinutes?: number | null | undefined;
  plannedAtMinutes?: number | null | undefined;
  notes?: string | null | undefined;
}

export const workoutService = {
  /** The workout page's read: a window around today, plus which local
   * date "today" actually is so the client doesn't have to guess. */
  async list(userId: string, daysBack = 7, daysForward = 21, now: Date = new Date()) {
    const timezone = await userTimezoneRepository.getTimezone(userId);
    const today = startOfLocalDayUtc(now, timezone);
    const from = new Date(today.getTime() - daysBack * 24 * 60 * 60_000);
    const to = new Date(today.getTime() + daysForward * 24 * 60 * 60_000);

    const workouts = await plannedWorkoutRepository.listInRange(userId, from, to);
    return {
      today: today.toISOString().slice(0, 10),
      timezone,
      workouts: workouts.map((w) => ({
        id: w.id,
        scheduledFor: w.scheduledFor.toISOString().slice(0, 10),
        kind: w.kind,
        title: w.title,
        plannedMinutes: w.plannedMinutes,
        plannedAtMinutes: w.plannedAtMinutes,
        notes: w.notes,
        completedAt: w.completedAt?.toISOString() ?? null,
        actualMinutes: w.actualMinutes,
        perceivedEffort: w.perceivedEffort,
      })),
    };
  },

  async create(userId: string, input: CreateWorkoutRequest) {
    const scheduledFor = parseLocalDate(input.scheduledFor);
    if (!scheduledFor) return null;
    return plannedWorkoutRepository.create({
      userId,
      scheduledFor,
      kind: input.kind,
      title: input.title,
      plannedMinutes: input.plannedMinutes ?? null,
      plannedAtMinutes: input.plannedAtMinutes ?? null,
      notes: input.notes ?? null,
    });
  },

  async complete(userId: string, id: string, actualMinutes: number | null, perceivedEffort: number | null) {
    return plannedWorkoutRepository.markCompleted(id, userId, actualMinutes, perceivedEffort);
  },

  async remove(userId: string, id: string) {
    return plannedWorkoutRepository.remove(id, userId);
  },
};
