import { describe, expect, it } from 'vitest';
import { correlateOccurrences, computeBestFocusHours, describeFinding } from './wellnessMemory.js';

const at = (dayOffset: number, hour: number) =>
  new Date(Date.UTC(2026, 6, 20 + dayOffset, hour, 0, 0));

/** A before-point and an after-point straddling the occurrence, inside
 * the 90-minute window either side. */
function straddle(occurredAt: Date, before: number, after: number) {
  return [
    { at: new Date(occurredAt.getTime() - 30 * 60_000), value: before },
    { at: new Date(occurredAt.getTime() + 30 * 60_000), value: after },
  ];
}

describe('correlateOccurrences', () => {
  it('drops labels with fewer than 3 usable occurrences', () => {
    const first = at(0, 9);
    const second = at(1, 9);
    const findings = correlateOccurrences(
      [
        { at: first, label: 'Meditation' },
        { at: second, label: 'Meditation' },
      ],
      [...straddle(first, 50, 60), ...straddle(second, 50, 60)],
    );
    expect(findings).toEqual([]);
  });

  it('reports a mean delta once there are enough occurrences', () => {
    const times = [at(0, 9), at(1, 9), at(2, 9)];
    const findings = correlateOccurrences(
      times.map((t) => ({ at: t, label: 'Meditation' })),
      times.flatMap((t) => straddle(t, 50, 60)),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.meanDelta).toBe(10);
    expect(findings[0]!.sampleSize).toBe(3);
  });

  it('skips occurrences missing a before or after measurement', () => {
    const times = [at(0, 9), at(1, 9), at(2, 9), at(3, 9)];
    const points = [
      ...times.slice(0, 3).flatMap((t) => straddle(t, 40, 55)),
      // Fourth occurrence has only a "before" point.
      { at: new Date(times[3]!.getTime() - 30 * 60_000), value: 40 },
    ];
    const findings = correlateOccurrences(times.map((t) => ({ at: t, label: 'Focus' })), points);
    expect(findings[0]!.sampleSize).toBe(3);
  });

  it('sorts findings by how large the effect is, not its direction', () => {
    const calm = [at(0, 9), at(1, 9), at(2, 9)];
    const spike = [at(0, 15), at(1, 15), at(2, 15)];
    const findings = correlateOccurrences(
      [...calm.map((t) => ({ at: t, label: 'Calm' })), ...spike.map((t) => ({ at: t, label: 'Spike' }))],
      [...calm.flatMap((t) => straddle(t, 50, 55)), ...spike.flatMap((t) => straddle(t, 50, 30))],
    );
    expect(findings[0]!.label).toBe('Spike');
  });
});

describe('computeBestFocusHours', () => {
  it('drops hours with only one session', () => {
    expect(computeBestFocusHours([{ hourOfDay: 9, score: 90 }])).toEqual([]);
  });

  it('ranks hours by mean score', () => {
    const ranked = computeBestFocusHours([
      { hourOfDay: 9, score: 90 },
      { hourOfDay: 9, score: 80 },
      { hourOfDay: 15, score: 50 },
      { hourOfDay: 15, score: 60 },
    ]);
    expect(ranked.map((h) => h.hourOfDay)).toEqual([9, 15]);
    expect(ranked[0]!.meanScore).toBe(85);
    expect(ranked[0]!.sampleSize).toBe(2);
  });
});

describe('describeFinding', () => {
  it('reads as an improvement when the metric moved the good way', () => {
    const line = describeFinding({ label: 'Meditation', meanDelta: 8, sampleSize: 5 }, 'recovery', true);
    expect(line).toContain('better');
    expect(line).toContain('5 times');
  });

  it('reads as a regression when a higher-is-better metric fell', () => {
    const line = describeFinding({ label: 'Late coffee', meanDelta: -6, sampleSize: 4 }, 'recovery', true);
    expect(line).toContain('worse');
  });

  it('inverts for metrics where lower is better', () => {
    const line = describeFinding({ label: 'Breathing', meanDelta: -9, sampleSize: 3 }, 'stress', false);
    expect(line).toContain('better');
  });
});
