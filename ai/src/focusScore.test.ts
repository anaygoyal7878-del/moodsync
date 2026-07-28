import { describe, expect, it } from 'vitest';
import { computeFocusSessionScore } from './focusScore.js';

describe('computeFocusSessionScore', () => {
  it('returns null with fewer than 3 samples', () => {
    expect(computeFocusSessionScore([70, 72])).toBeNull();
  });

  it('scores near 100 for a very stable heart rate', () => {
    const score = computeFocusSessionScore([70, 71, 70, 71, 70]);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(90);
  });

  it('scores near 0 for widely varying heart rate', () => {
    const score = computeFocusSessionScore([60, 100, 65, 105, 62]);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(20);
  });

  it('never exceeds the 0-100 bounds', () => {
    const perfect = computeFocusSessionScore([70, 70, 70, 70]);
    expect(perfect).toBeLessThanOrEqual(100);
    const chaotic = computeFocusSessionScore([40, 180, 50, 170, 45]);
    expect(chaotic).toBeGreaterThanOrEqual(0);
  });
});
