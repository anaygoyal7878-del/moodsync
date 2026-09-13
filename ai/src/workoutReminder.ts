import type { HealthScenario } from './healthScenarios.js';

/**
 * Workout reminders, and the one thing that makes them worth more than
 * a calendar alert: they know what the body is doing.
 *
 * A plain reminder ("Leg day today") is a note the user already wrote
 * to themselves. The version worth sending arrives on a morning when
 * recovery is down and says so, while there is still time to change the
 * plan. That is the whole reason `PlannedWorkout` stores a plan rather
 * than only a log.
 *
 * Pure and DB-free: the caller supplies the day's workouts, the clock,
 * and whatever the intelligence layer currently knows. This decides
 * what is due and what it should say.
 *
 * ## What this will not do
 *
 * It does not tell anyone to skip a workout. A `caution` scenario means
 * the signals are worth knowing about, not that training is unsafe —
 * MoodSync measures heart rate and sleep, not injury or illness, and
 * "don't train today" from a wellness app is a medical instruction it
 * has no grounds to give. The wording offers the easier option and
 * leaves the decision where it belongs.
 */

export interface PlannedWorkoutLike {
  id: string;
  title: string;
  kind: 'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'SPORT' | 'REST';
  plannedMinutes: number | null;
  /** Local minutes past midnight, or null for "sometime today". */
  plannedAtMinutes: number | null;
}

export interface WorkoutReminder {
  /** Workouts this reminder covers, so the caller can mark exactly
   * those as reminded rather than the whole day. */
  workoutIds: string[];
  title: string;
  body: string;
}

/**
 * Earliest local hour a morning reminder may fire.
 *
 * A reminder that arrives at 4am is an alarm clock nobody asked for.
 * Seven is late enough to be civil and early enough to still be
 * actionable for a morning session.
 */
export const MORNING_REMINDER_HOUR = 7;

/**
 * How long before a timed workout to send its reminder.
 *
 * Ninety minutes rather than fifteen: the point of this reminder is to
 * leave room to eat, change, or move the session. A nudge fifteen
 * minutes out can only tell you that you are already late.
 */
export const LEAD_MINUTES = 90;

/** Kind labels for notification copy. `REST` is included because a
 * planned rest day is a real plan worth confirming — it stops someone
 * training on the day they had deliberately left clear. */
const KIND_LABEL: Record<PlannedWorkoutLike['kind'], string> = {
  STRENGTH: 'Strength',
  CARDIO: 'Cardio',
  MOBILITY: 'Mobility',
  SPORT: 'Sport',
  REST: 'Rest day',
};

function formatLocalTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * Which of today's workouts are due for a reminder right now.
 *
 * Two paths, deliberately different:
 *
 *  - **Timed workouts** get their own reminder `LEAD_MINUTES` ahead.
 *    Not before — a 6pm session reminded at 7am is just the morning
 *    digest again, and it would burn the one notification that should
 *    have arrived when it mattered.
 *  - **Untimed workouts** ("legs, sometime today") are batched into one
 *    morning reminder. Sending three separate notifications for a day
 *    someone described in one sentence is how an inbox becomes noise.
 */
export function selectDueWorkouts(
  workouts: PlannedWorkoutLike[],
  localMinutesNow: number,
): { timed: PlannedWorkoutLike[]; morning: PlannedWorkoutLike[] } {
  const timed = workouts.filter(
    (w) => w.plannedAtMinutes !== null && localMinutesNow >= w.plannedAtMinutes - LEAD_MINUTES && localMinutesNow < w.plannedAtMinutes,
  );

  const pastMorningGate = localMinutesNow >= MORNING_REMINDER_HOUR * 60;
  const morning = pastMorningGate ? workouts.filter((w) => w.plannedAtMinutes === null) : [];

  return { timed, morning };
}

/**
 * Builds the reminder, folding in what the body is currently showing.
 *
 * `scenarios` comes straight from `healthScenarios.ts`. Only a
 * `caution` changes the wording — a `notice` is real but not worth
 * reshaping a reminder around, and letting every minor dip editorialise
 * the plan would make the advice meaningless through repetition.
 */
export function buildWorkoutReminder(
  workouts: PlannedWorkoutLike[],
  scenarios: HealthScenario[],
  localMinutesNow: number,
): WorkoutReminder | null {
  if (workouts.length === 0) return null;

  const caution = scenarios.find((s) => s.severity === 'caution');
  const restOnly = workouts.every((w) => w.kind === 'REST');

  const title = (() => {
    if (workouts.length > 1) return `${workouts.length} workouts planned today`;
    const only = workouts[0]!;
    const timeSuffix = only.plannedAtMinutes !== null ? ` at ${formatLocalTime(only.plannedAtMinutes)}` : ' today';
    return `${KIND_LABEL[only.kind]}: ${only.title}${timeSuffix}`;
  })();

  const plan = workouts
    .map((w) => {
      const duration = w.plannedMinutes ? ` (${w.plannedMinutes} min)` : '';
      const at = w.plannedAtMinutes !== null ? ` at ${formatLocalTime(w.plannedAtMinutes)}` : '';
      return `${w.title}${duration}${at}`;
    })
    .join(', ');

  // A rest day is never argued with: the signals being low is a reason
  // to rest, and telling someone their rest day might want to be easier
  // is nonsense.
  const body =
    caution && !restOnly
      ? `${plan}. Worth knowing first: ${lowercaseFirst(firstSentence(caution.finding))} An easier version of this session may suit today better — your call.`
      : `${plan}.`;

  return { workoutIds: workouts.map((w) => w.id), title, body };
}

function firstSentence(text: string): string {
  const match = text.match(/^(.*?[.!?])\s/);
  return match?.[1] ?? text;
}

function lowercaseFirst(text: string): string {
  return text.length > 0 ? text[0]!.toLowerCase() + text.slice(1) : text;
}
