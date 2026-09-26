import { describe, it, expect } from 'vitest';
import { ageFrom, estimateMaxHeartRate, heartRateZones, zoneFor, bmiFor, weightTrend } from './bodyProfile.js';

const NOW = new Date('2026-09-25T12:00:00Z');

describe('ageFrom', () => {
  it('counts whole years', () => {
    expect(ageFrom(new Date('2000-01-01T00:00:00Z'), NOW)).toBe(26);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    // The classic off-by-one: born in December, it is September.
    expect(ageFrom(new Date('2000-12-15T00:00:00Z'), NOW)).toBe(25);
  });

  it('counts the birthday on the day itself', () => {
    expect(ageFrom(new Date('2000-09-25T00:00:00Z'), NOW)).toBe(26);
  });

  it('rejects a future birth date and implausible ages', () => {
    expect(ageFrom(new Date('2030-01-01T00:00:00Z'), NOW)).toBeNull();
    expect(ageFrom(new Date('1880-01-01T00:00:00Z'), NOW)).toBeNull();
    expect(ageFrom(new Date('not a date'), NOW)).toBeNull();
  });
});

describe('estimateMaxHeartRate', () => {
  it('uses Tanaka 208 − 0.7 × age, not 220 − age', () => {
    // 220 − 40 = 180; Tanaka gives 180 too at 40 — so test where they
    // diverge. At 20, 220−age says 200 and Tanaka says 194.
    expect(estimateMaxHeartRate(20).bpm).toBe(194);
    expect(estimateMaxHeartRate(60).bpm).toBe(166);
  });

  it('carries the individual spread instead of presenting one number as fact', () => {
    // People scatter about ±10–12 bpm around any age formula.
    const estimate = estimateMaxHeartRate(30);
    expect(estimate.basis).toBe('tanaka-2001');
    expect(estimate.range!.high - estimate.range!.low).toBeGreaterThanOrEqual(20);
  });

  it('defers to a measured peak that exceeds the formula', () => {
    // The formula is a prior; a real observed maximum is evidence.
    const estimate = estimateMaxHeartRate(30, 201);
    expect(estimate).toMatchObject({ bpm: 201, basis: 'measured', range: null });
  });

  it('ignores an observed peak below the formula — that was just not a max effort', () => {
    expect(estimateMaxHeartRate(30, 150).basis).toBe('tanaka-2001');
  });
});

describe('heartRateZones', () => {
  it('produces five contiguous zones ending at max', () => {
    const zones = heartRateZones(190);
    expect(zones).toHaveLength(5);
    expect(zones[0]!.minBpm).toBe(95);
    expect(zones.at(-1)!.maxBpm).toBe(190);
    for (let i = 1; i < zones.length; i++) expect(zones[i]!.minBpm).toBe(zones[i - 1]!.maxBpm);
  });

  it('places a heart rate in the right zone, and nothing below zone 1', () => {
    const zones = heartRateZones(190);
    // 145 is 76% of 190 — zone 3 (70–80%). 160 is 84% — zone 4.
    expect(zoneFor(145, zones)!.zone).toBe(3);
    expect(zoneFor(160, zones)!.zone).toBe(4);
    expect(zoneFor(60, zones)).toBeNull();
  });
});

describe('bmiFor', () => {
  it('computes BMI and the CDC adult category', () => {
    const result = bmiFor(180, 75, 30)!;
    expect(result.value).toBe(23.1);
    expect(result.category).toBe('healthy');
  });

  it('withholds the category under 20 rather than applying adult cutoffs to a teen', () => {
    // CDC reads BMI for 2–19 against age-and-sex percentiles. An adult
    // category for a 16-year-old would be confidently wrong.
    const result = bmiFor(170, 60, 16)!;
    expect(result.value).toBe(20.8);
    expect(result.category).toBeNull();
    expect(result.note).toMatch(/don’t apply under 20/);
  });

  it('always states that BMI is a screening measure', () => {
    expect(bmiFor(180, 75, 30)!.note).toMatch(/screening measure, not a diagnosis/);
  });

  it('refuses an implausible height rather than computing a nonsense BMI', () => {
    // 70 typed into a centimetre field meaning inches.
    expect(bmiFor(70, 75, 30)).toBeNull();
    expect(bmiFor(180, 5, 30)).toBeNull();
  });

  it('uses the category boundaries correctly at their edges', () => {
    // A realistic 170cm height, with weight solved for the target BMI.
    // (A 1m height makes BMI equal weight, but then 18.4kg sits below the
    // plausibility floor and is — correctly — refused.)
    const at = (bmi: number) => bmiFor(170, bmi * 1.7 * 1.7, 30)!.category;
    expect(at(18.4)).toBe('underweight');
    expect(at(18.5)).toBe('healthy');
    expect(at(25)).toBe('overweight');
    expect(at(30)).toBe('obesity');
  });
});

describe('weightTrend', () => {
  const e = (kg: number, iso: string) => ({ weightKg: kg, recordedAt: new Date(iso) });

  it('reports change across at least a week of entries', () => {
    const trend = weightTrend([e(80, '2026-09-01T00:00:00Z'), e(78.5, '2026-09-20T00:00:00Z')])!;
    expect(trend.changeKg).toBe(-1.5);
    expect(trend.latestKg).toBe(78.5);
  });

  it('will not call two days of water weight a trend', () => {
    // Daily weight swings a kilo or more; a two-day "change" is noise.
    const trend = weightTrend([e(80, '2026-09-18T00:00:00Z'), e(81.2, '2026-09-20T00:00:00Z')])!;
    expect(trend.changeKg).toBeNull();
  });

  it('handles a single entry and no entries', () => {
    expect(weightTrend([e(80, '2026-09-20T00:00:00Z')])!.changeKg).toBeNull();
    expect(weightTrend([])).toBeNull();
  });

  it('orders entries by date, not by insertion', () => {
    const trend = weightTrend([e(78, '2026-09-20T00:00:00Z'), e(80, '2026-09-01T00:00:00Z')])!;
    expect(trend.latestKg).toBe(78);
    expect(trend.changeKg).toBe(-2);
  });
});
