import { describe, expect, it } from 'vitest';
import { computeSocialBattery, socialBatteryGuidance } from './socialBattery.js';

const base = { sleepScore: null, hrvZ: null, recoveryScore: null, bookedHoursToday: null };

describe('computeSocialBattery', () => {
  it('returns null with neither sleep nor recovery', () => {
    expect(computeSocialBattery({ ...base, hrvZ: 1, bookedHoursToday: 2 })).toBeNull();
  });

  it('reports high on strong sleep and recovery', () => {
    const result = computeSocialBattery({ ...base, sleepScore: 85, recoveryScore: 85 });
    expect(result!.level).toBe('high');
    expect(result!.value).toBeGreaterThanOrEqual(67);
  });

  it('reports low on poor sleep and recovery', () => {
    const result = computeSocialBattery({ ...base, sleepScore: 20, recoveryScore: 20 });
    expect(result!.level).toBe('low');
    expect(result!.reasons).toContain('you slept poorly');
    expect(result!.reasons).toContain('your recovery is low today');
  });

  it('always carries the AI-estimate disclaimer', () => {
    const result = computeSocialBattery({ ...base, sleepScore: 60, recoveryScore: 60 });
    expect(result!.disclaimer).toContain('not a medical measurement');
  });

  it('counts a heavy schedule against the estimate and names it', () => {
    const light = computeSocialBattery({ ...base, sleepScore: 70, recoveryScore: 70, bookedHoursToday: 0 })!;
    const heavy = computeSocialBattery({ ...base, sleepScore: 70, recoveryScore: 70, bookedHoursToday: 8 })!;
    expect(heavy.value).toBeLessThan(light.value);
    expect(heavy.reasons.some((r) => r.includes('8 hours booked'))).toBe(true);
  });

  it('falls back to a neutral reason when nothing stands out', () => {
    const result = computeSocialBattery({ ...base, sleepScore: 60, recoveryScore: 60 });
    expect(result!.reasons).toEqual(['your recent numbers are close to your own average']);
  });

  it('gives distinct guidance per level', () => {
    expect(socialBatteryGuidance('low')).toContain('quiet evening');
    expect(socialBatteryGuidance('high')).not.toBe(socialBatteryGuidance('medium'));
  });
});
