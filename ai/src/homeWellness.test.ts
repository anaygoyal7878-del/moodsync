import { describe, expect, it } from 'vitest';
import { computeHomeWellnessScore, computeOverallHomeWellnessScore } from './homeWellness.js';

function room(overrides: Partial<Parameters<typeof computeHomeWellnessScore>[0]> = {}) {
  return { roomId: 'r1', name: 'Bedroom', temperatureC: null, humidityPct: null, airQuality: null, ...overrides };
}

describe('computeHomeWellnessScore', () => {
  it('scores 100 for temperature/humidity within the ideal range', () => {
    const result = computeHomeWellnessScore(room({ temperatureC: 22, humidityPct: 40 }));
    expect(result.temperatureScore.value).toBe(100);
    expect(result.humidityScore.value).toBe(100);
    expect(result.overallScore.value).toBe(100);
  });

  it('lowers the score the further outside the ideal range', () => {
    const near = computeHomeWellnessScore(room({ temperatureC: 26 }));
    const far = computeHomeWellnessScore(room({ temperatureC: 30 }));
    expect(near.temperatureScore.value).not.toBeNull();
    expect(far.temperatureScore.value).not.toBeNull();
    expect(far.temperatureScore.value!).toBeLessThan(near.temperatureScore.value!);
  });

  it('returns null (not 0) for a metric with no sensor data', () => {
    const result = computeHomeWellnessScore(room());
    expect(result.temperatureScore.value).toBeNull();
    expect(result.humidityScore.value).toBeNull();
    expect(result.airQualityScore.value).toBeNull();
    expect(result.overallScore.value).toBeNull();
  });

  it('parses a numeric air-quality value (1=excellent..5=poor), treats 0 (unknown) as null', () => {
    expect(computeHomeWellnessScore(room({ airQuality: '1' })).airQualityScore.value).toBe(100);
    expect(computeHomeWellnessScore(room({ airQuality: '5' })).airQualityScore.value).toBe(20);
    expect(computeHomeWellnessScore(room({ airQuality: '0' })).airQualityScore.value).toBeNull();
  });

  it('parses a known air-quality name', () => {
    expect(computeHomeWellnessScore(room({ airQuality: 'Good' })).airQualityScore.value).toBe(80);
  });

  it('does not guess at an unrecognized air-quality value', () => {
    expect(computeHomeWellnessScore(room({ airQuality: 'sparkling' })).airQualityScore.value).toBeNull();
  });

  it('averages only the metrics that have data, not all three unconditionally', () => {
    const result = computeHomeWellnessScore(room({ temperatureC: 22 }));
    expect(result.overallScore.value).toBe(100); // only temperature contributes
  });
});

describe('computeOverallHomeWellnessScore', () => {
  it('averages across rooms, ignoring rooms with no sensor data', () => {
    const rooms = [
      room({ roomId: 'r1', temperatureC: 22 }), // 100
      room({ roomId: 'r2' }), // no data, excluded
      room({ roomId: 'r3', temperatureC: 30 }), // low score
    ];
    const result = computeOverallHomeWellnessScore(rooms);
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeGreaterThan(0);
    expect(result.value!).toBeLessThan(100);
  });

  it('returns null when no room has any sensor data', () => {
    expect(computeOverallHomeWellnessScore([room(), room({ roomId: 'r2' })]).value).toBeNull();
  });
});
