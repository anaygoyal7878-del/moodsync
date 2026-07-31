import { describe, expect, it } from 'vitest';
import { describeActiveState, journeyLabel, type ActiveStateInput } from './moodLanguage.js';

const base: ActiveStateInput = {
  mode: 'RELAX',
  baselineStress: 70,
  currentStress: 70,
  heartRateDelta: 0,
  elapsedMinutes: 10,
};

describe('describeActiveState', () => {
  it('stays non-committal in the first few minutes', () => {
    const state = describeActiveState({ ...base, elapsedMinutes: 1, currentStress: 20 });
    expect(state.label).toBe('Settling In');
    expect(state.progress).toBeNull();
  });

  it('calls a large stress drop deeply settling', () => {
    const state = describeActiveState({ ...base, currentStress: 45 });
    expect(state.label).toBe('Deeply Settling');
    expect(state.progress).toBeGreaterThan(0);
  });

  it('calls a mild stress drop softening', () => {
    expect(describeActiveState({ ...base, currentStress: 62 }).label).toBe('Softening');
  });

  it('falls back to heart rate when stress is unavailable', () => {
    const state = describeActiveState({ ...base, baselineStress: null, currentStress: null, heartRateDelta: -8 });
    expect(state.label).toBe('Coming Down');
  });

  it('says nothing has shifted rather than inventing progress', () => {
    const state = describeActiveState(base);
    expect(state.label).toBe('Holding Steady');
    expect(state.progress).toBeNull();
  });

  it('is honest when a calming session is not landing', () => {
    const state = describeActiveState({ ...base, currentStress: 85 });
    expect(state.label).toBe('Still Carrying It');
    expect(state.detail).toContain('try something else');
    expect(state.progress).toBeNull();
  });

  it('uses activating vocabulary for workout mode', () => {
    const state = describeActiveState({ ...base, mode: 'WORKOUT', heartRateDelta: 35 });
    expect(state.label).toBe('Lifting');
    expect(state.progress).toBeGreaterThan(0);
  });

  it('never calls a workout session settling', () => {
    const state = describeActiveState({ ...base, mode: 'WORKOUT', currentStress: 30, heartRateDelta: -10 });
    expect(state.label).toBe('Easing Off');
  });

  it('keeps progress within 0-1 for an extreme reading', () => {
    const state = describeActiveState({ ...base, baselineStress: 100, currentStress: 0 });
    expect(state.progress).toBeLessThanOrEqual(1);
  });
});

describe('journeyLabel', () => {
  it('reads as a calmer journey when things settled', () => {
    expect(journeyLabel(describeActiveState({ ...base, currentStress: 45 }))).toBe('Baseline → Calmer state');
  });

  it('does not claim calm when the session did not land', () => {
    expect(journeyLabel(describeActiveState({ ...base, currentStress: 85 }))).toBe('Baseline → Where you are now');
  });

  it('reads as energised for an activating session', () => {
    expect(journeyLabel(describeActiveState({ ...base, mode: 'WORKOUT', heartRateDelta: 30 }))).toBe('Baseline → Energised');
  });
});
