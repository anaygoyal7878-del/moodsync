import { describe, expect, it } from 'vitest';
import { computeLiveEnergyMeter } from './energyMeter.js';
import type { WellnessScore } from './wellness.js';

function score(value: number | null): WellnessScore {
  return { value, basis: 'heuristic' };
}

describe('computeLiveEnergyMeter', () => {
  it('returns null with no available biometric scores and no caffeine', () => {
    const result = computeLiveEnergyMeter(
      { sleep: score(null), recovery: score(null), stress: score(null), energy: score(null) },
      [],
    );
    expect(result.value).toBeNull();
    expect(result.caffeineBoost).toBe(0);
  });

  it('computes a weighted base from available scores', () => {
    const result = computeLiveEnergyMeter(
      { sleep: score(80), recovery: score(80), stress: score(20), energy: score(60) },
      [],
    );
    // recovery 80*.35 + sleep 80*.35 + (100-20)*.2 + energy 60*.1 = 28+28+16+6 = 78
    expect(result.value).toBe(78);
    expect(result.caffeineBoost).toBe(0);
  });

  it('redistributes weight when some scores are missing', () => {
    const result = computeLiveEnergyMeter(
      { sleep: score(90), recovery: score(null), stress: score(null), energy: score(null) },
      [],
    );
    expect(result.value).toBe(90);
  });

  it('applies a caffeine boost for a very recent log', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const result = computeLiveEnergyMeter(
      { sleep: score(50), recovery: score(50), stress: score(50), energy: score(50) },
      [{ mg: 200, loggedAt: now }],
      now,
    );
    expect(result.caffeineBoost).toBe(15);
    expect(result.value).toBe(65);
  });

  it('decays the caffeine boost as time passes', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const loggedAt = new Date('2026-07-28T09:30:00Z'); // 2.5h ago, half the 5h window
    const result = computeLiveEnergyMeter(
      { sleep: score(50), recovery: score(50), stress: score(50), energy: score(50) },
      [{ mg: 200, loggedAt }],
      now,
    );
    expect(result.caffeineBoost).toBeGreaterThan(0);
    expect(result.caffeineBoost).toBeLessThan(15);
  });

  it('ignores caffeine logs older than the decay window', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const loggedAt = new Date('2026-07-28T06:00:00Z'); // 6h ago
    const result = computeLiveEnergyMeter(
      { sleep: score(50), recovery: score(50), stress: score(50), energy: score(50) },
      [{ mg: 200, loggedAt }],
      now,
    );
    expect(result.caffeineBoost).toBe(0);
  });

  it('caps the caffeine boost even with multiple recent logs', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const result = computeLiveEnergyMeter(
      { sleep: score(50), recovery: score(50), stress: score(50), energy: score(50) },
      [
        { mg: 200, loggedAt: now },
        { mg: 200, loggedAt: now },
        { mg: 200, loggedAt: now },
      ],
      now,
    );
    expect(result.caffeineBoost).toBe(15);
  });

  it('never exceeds 100 even with a large caffeine boost on a high base', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const result = computeLiveEnergyMeter(
      { sleep: score(100), recovery: score(100), stress: score(0), energy: score(100) },
      [{ mg: 200, loggedAt: now }],
      now,
    );
    expect(result.value).toBe(100);
  });
});
