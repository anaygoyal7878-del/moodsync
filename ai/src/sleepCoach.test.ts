import { describe, expect, it } from 'vitest';
import { computeBedtimeTarget, buildWindDownRoutine, summarizeSleepQuality } from './sleepCoach.js';

describe('computeBedtimeTarget', () => {
  it('returns null without a calendar commitment rather than guessing a wake time', () => {
    expect(computeBedtimeTarget(null)).toBeNull();
  });

  it('works back 8 hours of sleep plus an hour to get ready', () => {
    const target = computeBedtimeTarget(new Date('2026-07-29T09:00:00Z'), new Date('2026-07-28T20:00:00Z'));
    expect(target!.asleepBy.toISOString()).toBe('2026-07-29T00:00:00.000Z');
    expect(target!.windDownAt.toISOString()).toBe('2026-07-28T23:30:00.000Z');
    expect(target!.anchoredToCalendar).toBe(true);
  });

  it('explains what anchored the target', () => {
    const target = computeBedtimeTarget(new Date('2026-07-29T09:00:00Z'), new Date('2026-07-28T20:00:00Z'));
    expect(target!.reason).toContain('first commitment tomorrow');
  });
});

describe('buildWindDownRoutine', () => {
  const base = { bedroomTemperatureC: null, sleepRangeC: null, stressScore: null, sleepSceneName: null };

  it('omits the temperature step when there is no sensor or range', () => {
    const steps = buildWindDownRoutine(base);
    expect(steps.some((s) => s.kind === 'temperature')).toBe(false);
  });

  it('suggests cooling when the bedroom is above the sleep range', () => {
    const steps = buildWindDownRoutine({ ...base, bedroomTemperatureC: 25, sleepRangeC: { min: 18, max: 21 } });
    const temp = steps.find((s) => s.kind === 'temperature');
    expect(temp!.label).toContain('Cool');
    expect(temp!.reason).toContain('25');
  });

  it('suggests warming when the bedroom is below the sleep range', () => {
    const steps = buildWindDownRoutine({ ...base, bedroomTemperatureC: 14, sleepRangeC: { min: 18, max: 21 } });
    expect(steps.find((s) => s.kind === 'temperature')!.label).toContain('Warm');
  });

  it('adds breathing only when stress is elevated', () => {
    expect(buildWindDownRoutine({ ...base, stressScore: 30 }).some((s) => s.kind === 'breathing')).toBe(false);
    expect(buildWindDownRoutine({ ...base, stressScore: 75 }).some((s) => s.kind === 'breathing')).toBe(true);
  });

  it("prefers the user's real sleep scene over generic lighting advice", () => {
    const withScene = buildWindDownRoutine({ ...base, sleepSceneName: 'Good Night' });
    expect(withScene.some((s) => s.kind === 'scene')).toBe(true);
    expect(withScene.some((s) => s.kind === 'light')).toBe(false);

    const withoutScene = buildWindDownRoutine(base);
    expect(withoutScene.some((s) => s.kind === 'light')).toBe(true);
  });

  it('always ends with the screens step', () => {
    const steps = buildWindDownRoutine(base);
    expect(steps[steps.length - 1]!.kind).toBe('screens');
  });
});

describe('summarizeSleepQuality', () => {
  const night = (sleepScore: number | null, stages?: [number, number, number]) => ({
    sleepScore,
    deepSleepMinutes: stages?.[0] ?? null,
    remSleepMinutes: stages?.[1] ?? null,
    lightSleepMinutes: stages?.[2] ?? null,
  });

  it('reports nulls with no measured nights', () => {
    const summary = summarizeSleepQuality([]);
    expect(summary.averageScore).toBeNull();
    expect(summary.nightsMeasured).toBe(0);
  });

  it('averages only the nights that were measured', () => {
    const summary = summarizeSleepQuality([night(80), night(null), night(60)]);
    expect(summary.averageScore).toBe(70);
    expect(summary.nightsMeasured).toBe(2);
  });

  it('leaves total minutes null when no provider reported stages', () => {
    expect(summarizeSleepQuality([night(80), night(70)]).averageTotalMinutes).toBeNull();
  });

  it('totals stage minutes when they exist', () => {
    const summary = summarizeSleepQuality([night(80, [90, 100, 260]), night(70, [80, 110, 250])]);
    expect(summary.averageTotalMinutes).toBe(445);
  });

  it('compares last night against the prior nights', () => {
    const summary = summarizeSleepQuality([night(90), night(70), night(70)]);
    expect(summary.lastNightVsAverage).toBe(20);
  });

  it('has nothing to compare against on the first measured night', () => {
    expect(summarizeSleepQuality([night(90)]).lastNightVsAverage).toBeNull();
  });
});
