import { describe, it, expect } from 'vitest';
import {
  selectDueWorkouts,
  buildWorkoutReminder,
  MORNING_REMINDER_HOUR,
  LEAD_MINUTES,
  type PlannedWorkoutLike,
} from './workoutReminder.js';
import type { HealthScenario } from './healthScenarios.js';

const w = (over: Partial<PlannedWorkoutLike> = {}): PlannedWorkoutLike => ({
  id: 'w1',
  title: 'Leg day',
  kind: 'STRENGTH',
  plannedMinutes: 45,
  plannedAtMinutes: null,
  ...over,
});

const caution: HealthScenario = {
  id: 'strain-or-illness-warning',
  severity: 'caution',
  title: 'Your body is showing two stress signals at once',
  finding: 'Your HRV is 41ms against your usual 61ms, and your resting heart rate is 59bpm against your usual 52bpm. More detail here.',
  guidance: 'Consider an easy day.',
  basis: 'Sports-science work on athlete monitoring.',
  isDiagnostic: false,
  sampleSize: 20,
};

const notice: HealthScenario = { ...caution, id: 'incomplete-recovery', severity: 'notice' };

describe('selectDueWorkouts', () => {
  it('holds a morning reminder until a civil hour', () => {
    // A reminder at 4am is an alarm clock nobody asked for.
    expect(selectDueWorkouts([w()], 4 * 60).morning).toHaveLength(0);
    expect(selectDueWorkouts([w()], MORNING_REMINDER_HOUR * 60).morning).toHaveLength(1);
  });

  it('reminds a timed workout ahead of it, with room to act', () => {
    // 6pm session. The point is time to eat, change, or move it — not to
    // learn you are already late.
    const evening = [w({ plannedAtMinutes: 18 * 60 })];
    expect(selectDueWorkouts(evening, 18 * 60 - LEAD_MINUTES).timed).toHaveLength(1);
    expect(selectDueWorkouts(evening, 18 * 60 - LEAD_MINUTES - 1).timed).toHaveLength(0);
  });

  it('does not remind a timed workout once it has started', () => {
    expect(selectDueWorkouts([w({ plannedAtMinutes: 18 * 60 })], 18 * 60).timed).toHaveLength(0);
  });

  it('keeps an evening session out of the morning batch', () => {
    // Otherwise the 7am digest burns the notification that should have
    // arrived at 4:30pm when it could still change anything.
    const result = selectDueWorkouts([w({ plannedAtMinutes: 18 * 60 })], 8 * 60);
    expect(result.morning).toHaveLength(0);
    expect(result.timed).toHaveLength(0);
  });

  it('batches every untimed workout into one morning reminder', () => {
    // Three notifications for a day someone described in one sentence
    // is how an inbox becomes noise.
    const result = selectDueWorkouts([w({ id: 'a' }), w({ id: 'b' }), w({ id: 'c' })], 9 * 60);
    expect(result.morning).toHaveLength(3);
  });
});

describe('buildWorkoutReminder', () => {
  it('returns nothing when there is nothing planned', () => {
    expect(buildWorkoutReminder([], [], 9 * 60)).toBeNull();
  });

  it('names the workout and its duration', () => {
    const reminder = buildWorkoutReminder([w()], [], 9 * 60)!;
    expect(reminder.title).toContain('Leg day');
    expect(reminder.body).toContain('45 min');
  });

  it('folds a caution into the reminder while there is still time to change the plan', () => {
    // The whole reason PlannedWorkout stores a plan and not just a log.
    const reminder = buildWorkoutReminder([w()], [caution], 9 * 60)!;
    expect(reminder.body).toContain('41ms');
    expect(reminder.body).toMatch(/easier version/i);
  });

  it('never tells someone not to train', () => {
    // MoodSync measures heart rate and sleep, not injury or illness.
    // "Don't train today" is a medical instruction it has no grounds for.
    const reminder = buildWorkoutReminder([w()], [caution], 9 * 60)!;
    expect(reminder.body).not.toMatch(/\b(skip|don'?t train|do not train|cancel|rest instead)\b/i);
    expect(reminder.body).toMatch(/your call/i);
  });

  it('leaves the wording alone for a notice — only a caution reshapes the plan', () => {
    // Letting every minor dip editorialise would make the advice
    // meaningless through repetition.
    const reminder = buildWorkoutReminder([w()], [notice], 9 * 60)!;
    expect(reminder.body).not.toMatch(/easier version/i);
  });

  it('does not argue with a planned rest day', () => {
    // Low signals are a reason to rest. Suggesting an easier rest day is
    // nonsense.
    const reminder = buildWorkoutReminder([w({ kind: 'REST', title: 'Full rest' })], [caution], 9 * 60)!;
    expect(reminder.body).not.toMatch(/easier version/i);
    expect(reminder.title).toContain('Rest day');
  });

  it('summarizes a multi-workout day in the title rather than naming one', () => {
    const reminder = buildWorkoutReminder([w({ id: 'a' }), w({ id: 'b', title: 'Easy run' })], [], 9 * 60)!;
    expect(reminder.title).toContain('2 workouts');
    expect(reminder.body).toContain('Easy run');
  });

  it('reports exactly which workouts it covered, so only those get marked reminded', () => {
    const reminder = buildWorkoutReminder([w({ id: 'a' }), w({ id: 'b' })], [], 9 * 60)!;
    expect(reminder.workoutIds).toEqual(['a', 'b']);
  });

  it('renders a local time readably', () => {
    expect(buildWorkoutReminder([w({ plannedAtMinutes: 17 * 60 + 30 })], [], 9 * 60)!.title).toContain('5:30pm');
    expect(buildWorkoutReminder([w({ plannedAtMinutes: 12 * 60 })], [], 9 * 60)!.title).toContain('12pm');
    expect(buildWorkoutReminder([w({ plannedAtMinutes: 0 })], [], 9 * 60)!.title).toContain('12am');
  });
});
