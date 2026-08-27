import { describe, it, expect } from 'vitest';
import { rankRecoveryActions, type RecoveryActionInput } from './recoveryActions.js';

const base: RecoveryActionInput = {
  recoveryScore: 70,
  stressScore: 30,
  sleepScore: 80,
  restingHeartRateDelta: 0,
  stepsToday: 9000,
  hourOfDay: 10,
  memory: [],
};

describe('rankRecoveryActions', () => {
  it('returns at most the limit — a page that lists everything recommends nothing', () => {
    expect(rankRecoveryActions(base)).toHaveLength(3);
    expect(rankRecoveryActions(base, 2)).toHaveLength(2);
  });

  it('leads with a memory-backed action and cites the real number and sample size', () => {
    const actions = rankRecoveryActions({
      ...base,
      memory: [{ label: 'Meditation', meanDelta: 6, sampleSize: 5 }],
    });

    expect(actions[0]!.kind).toBe('breathing');
    expect(actions[0]!.personalized).toBe(true);
    expect(actions[0]!.reason).toContain('+6');
    expect(actions[0]!.reason).toContain('5 sessions');
  });

  it('outranks a strong live signal with the user’s own measured history', () => {
    // Elevated stress alone would put breathing on top; a walk the user
    // has actually measured should beat it.
    const actions = rankRecoveryActions({
      ...base,
      stressScore: 85,
      memory: [{ label: 'Walk in the park', meanDelta: 5, sampleSize: 4 }],
    });

    expect(actions[0]!.kind).toBe('walk');
    expect(actions[0]!.personalized).toBe(true);
  });

  it('ignores memory findings below the sample-size floor', () => {
    const actions = rankRecoveryActions({
      ...base,
      memory: [{ label: 'Meditation', meanDelta: 9, sampleSize: 2 }],
    });

    expect(actions.every((a) => !a.personalized)).toBe(true);
  });

  it('ignores memory findings whose delta is noise', () => {
    const actions = rankRecoveryActions({
      ...base,
      memory: [{ label: 'Meditation', meanDelta: 1, sampleSize: 20 }],
    });

    expect(actions.every((a) => !a.personalized)).toBe(true);
  });

  it('ignores memory labels that are not one of these four actions', () => {
    // A scene that helps is a real finding — it just isn't one of these
    // actions, so it must not be forced into this list.
    const actions = rankRecoveryActions({
      ...base,
      memory: [{ label: '"Evening Calm" scene', meanDelta: 8, sampleSize: 10 }],
    });

    expect(actions.every((a) => !a.personalized)).toBe(true);
  });

  it('surfaces breathing with the real stress number when stress is elevated', () => {
    const actions = rankRecoveryActions({ ...base, stressScore: 78 });
    const breathing = actions.find((a) => a.kind === 'breathing');

    expect(breathing?.reason).toContain('78');
    expect(breathing?.personalized).toBe(false);
  });

  it('cites the resting heart rate gap when it is elevated', () => {
    const actions = rankRecoveryActions({ ...base, restingHeartRateDelta: 5 });
    const hydrate = actions.find((a) => a.kind === 'hydrate');

    expect(hydrate?.reason).toContain('5 bpm above your baseline');
  });

  it('drops "end work earlier" late at night, when its moment has passed', () => {
    const evening = rankRecoveryActions({ ...base, sleepScore: 40, hourOfDay: 17 });
    expect(evening.some((a) => a.kind === 'stop_early')).toBe(true);

    const lateNight = rankRecoveryActions({ ...base, sleepScore: 40, hourOfDay: 23 });
    expect(lateNight.some((a) => a.kind === 'stop_early')).toBe(false);
  });

  it('drops the walk overnight rather than reordering it', () => {
    const actions = rankRecoveryActions({ ...base, hourOfDay: 2 });
    expect(actions.some((a) => a.kind === 'walk')).toBe(false);
  });

  it('calls out a sedentary day only once it is actually late enough to be one', () => {
    const morning = rankRecoveryActions({ ...base, stepsToday: 900, hourOfDay: 9 });
    expect(morning.find((a) => a.kind === 'walk')?.reason).not.toContain('900');

    const afternoon = rankRecoveryActions({ ...base, stepsToday: 900, hourOfDay: 16 });
    expect(afternoon.find((a) => a.kind === 'walk')?.reason).toContain('900');
  });

  it('still returns usable actions when every signal is missing', () => {
    const actions = rankRecoveryActions({
      recoveryScore: null,
      stressScore: null,
      sleepScore: null,
      restingHeartRateDelta: null,
      stepsToday: null,
      hourOfDay: 10,
      memory: [],
    });

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.reason.length > 0)).toBe(true);
    expect(actions.every((a) => !a.personalized)).toBe(true);
  });

  it('never claims a number it was not given', () => {
    const actions = rankRecoveryActions(base);
    // No signal is elevated here, so no reason should quote a metric.
    expect(actions.every((a) => !/\d+ bpm above/.test(a.reason))).toBe(true);
  });
});
