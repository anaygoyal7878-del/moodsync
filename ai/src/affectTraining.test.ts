import { describe, expect, it } from 'vitest';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { buildSamples, learnAffect, learningStatus } from './affectTraining.js';
import { readingForMoment, usableFeatures, extractFeatures } from './affectFeatures.js';
import { MIN_SAMPLES_TO_LEARN } from './affectModel.js';

const BASE = Date.UTC(2026, 7, 1, 12, 0, 0);

function reading(offsetMinutes: number, fields: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return {
    provider: 'apple_health',
    userId: 'u1',
    timestamp: new Date(BASE + offsetMinutes * 60_000).toISOString(),
    ...fields,
  } as NormalizedBiometricReading;
}

describe('readingForMoment', () => {
  const moment = new Date(BASE + 100 * 60_000);

  it('picks the most recent reading before the moment', () => {
    const chosen = readingForMoment([reading(0), reading(60), reading(90)], moment);
    expect(chosen!.timestamp).toBe(reading(90).timestamp);
  });

  it('never uses a reading from after the moment', () => {
    // A reading taken after someone says they feel terrible may already
    // reflect what they did about it. Predicting the present from the
    // future is the leak that makes an eval look great and a product
    // feel broken.
    const chosen = readingForMoment([reading(60), reading(105)], moment);
    expect(chosen!.timestamp).toBe(reading(60).timestamp);
  });

  it('returns null when nothing falls inside the window', () => {
    // 100 minutes before the moment is inside a 120-minute window;
    // 400 minutes before is not.
    expect(readingForMoment([reading(-400)], moment)).toBeNull();
  });

  it('ignores unparseable timestamps rather than throwing', () => {
    const broken = { ...reading(60), timestamp: 'not-a-date' } as NormalizedBiometricReading;
    expect(readingForMoment([broken, reading(60)], moment)).not.toBeNull();
  });
});

describe('extractFeatures', () => {
  it('omits a metric with too little history to have a baseline', () => {
    // Two prior readings is below MIN_SAMPLES_FOR_BASELINE — there is no
    // meaningful "normal" to deviate from yet.
    const features = extractFeatures(reading(100, { heartRate: 70 }), [
      reading(0, { heartRate: 60 }),
      reading(10, { heartRate: 62 }),
    ]);
    expect(features.heartRate).toBeUndefined();
  });

  it('z-scores against the person’s own history once there is enough of it', () => {
    const history = Array.from({ length: 10 }, (_, i) => reading(i, { heartRate: 60 }));
    const features = extractFeatures(reading(100, { heartRate: 80 }), history);

    // Well above a flat-60 baseline — sign is what matters, the exact
    // magnitude depends on personalBaselines' regularised denominator.
    expect(features.heartRate).toBeGreaterThan(0);
  });

  it('never invents a feature the reading does not carry', () => {
    const history = Array.from({ length: 10 }, (_, i) => reading(i, { heartRate: 60 }));
    const features = extractFeatures(reading(100, { heartRate: 70 }), history);

    // No imputing to the mean: a missing signal stays missing.
    expect(features.heartRateVariability).toBeUndefined();
    expect(features.recoveryScore).toBeUndefined();
  });
});

describe('usableFeatures', () => {
  it('drops a feature present in only a few check-ins', () => {
    const samples = [
      ...Array.from({ length: 9 }, () => ({ features: { heartRate: Math.random() } })),
      { features: { heartRate: 0.5, recoveryScore: 1.2 } },
    ];
    expect(usableFeatures(samples)).not.toContain('recoveryScore');
  });

  it('drops a constant feature, which is unlearnable and wastes a slot', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      features: { heartRate: i * 0.1, restingHeartRate: 1 },
    }));
    const usable = usableFeatures(samples);

    expect(usable).toContain('heartRate');
    expect(usable).not.toContain('restingHeartRate');
  });

  it('returns nothing for an empty dataset rather than every candidate', () => {
    expect(usableFeatures([])).toEqual([]);
  });
});

describe('buildSamples', () => {
  it('drops check-ins with no reading near them', () => {
    const readings = Array.from({ length: 10 }, (_, i) => reading(i, { heartRate: 60 + i }));
    const checkIns = [
      { valence: 1, arousal: 0, createdAt: new Date(BASE + 20 * 60_000) }, // reading nearby
      { valence: 1, arousal: 0, createdAt: new Date(BASE + 5000 * 60_000) }, // nothing near
    ];

    expect(buildSamples(checkIns, readings)).toHaveLength(1);
  });

  it('builds each check-in’s baseline only from readings before it', () => {
    // If later readings leaked into an earlier baseline, the first
    // check-in's z-score would shift. Fixing history at 60 then jumping
    // to 200 makes any leak obvious.
    const readings = [
      ...Array.from({ length: 10 }, (_, i) => reading(i, { heartRate: 60 })),
      ...Array.from({ length: 10 }, (_, i) => reading(200 + i, { heartRate: 200 })),
    ];
    const early = buildSamples([{ valence: 0, arousal: 0, createdAt: new Date(BASE + 15 * 60_000) }], readings);

    // Latest pre-moment reading is 60 against a flat-60 baseline: no
    // deviation. A leak from the 200s would push this away from zero.
    expect(early[0]!.features.heartRate).toBeCloseTo(0, 6);
  });
});

describe('learnAffect + learningStatus', () => {
  function dataset(count: number) {
    const readings: NormalizedBiometricReading[] = Array.from({ length: 12 }, (_, i) =>
      reading(i, { heartRate: 60, activityLevel: 40 }),
    );
    const checkIns = [];
    for (let i = 0; i < count; i++) {
      const minute = 100 + i * 30;
      readings.push(reading(minute - 5, { heartRate: 60 + (i % 7) * 3, activityLevel: 40 + (i % 5) }));
      checkIns.push({ valence: (i % 5) - 2, arousal: (i % 5) - 2, createdAt: new Date(BASE + minute * 60_000) });
    }
    return { readings, checkIns };
  }

  it('reports how many more check-ins are needed before it will even look', () => {
    const { readings, checkIns } = dataset(5);
    const learning = learnAffect(checkIns, readings);

    expect(learning.valence.usable).toBe(false);
    expect(learningStatus(learning)).toContain('more check-in');
  });

  it('distinguishes a sync gap from a lack of check-ins', () => {
    // Plenty of check-ins, but no readings anywhere near them.
    const checkIns = Array.from({ length: MIN_SAMPLES_TO_LEARN + 5 }, (_, i) => ({
      valence: 0,
      arousal: 0,
      createdAt: new Date(BASE + (10_000 + i * 60) * 60_000),
    }));
    const learning = learnAffect(checkIns, [reading(0, { heartRate: 60 })]);

    expect(learning.totalCheckIns).toBeGreaterThan(learning.usableSamples);
    expect(learningStatus(learning)).toContain('sync gap');
  });

  it('says plainly when it looked and found nothing, rather than implying progress', () => {
    const { readings, checkIns } = dataset(40);
    const learning = learnAffect(checkIns, readings);

    if (learning.findings.length === 0) {
      const status = learningStatus(learning);
      // "That's a real result" — an absent finding is reported as a
      // finding, not as "still learning".
      expect(status).toMatch(/real result|isn’t reporting any metric/);
    }
    expect(learning.totalCheckIns).toBe(40);
  });

  it('never emits a finding from a model that failed its floors', () => {
    const { readings, checkIns } = dataset(30);
    const learning = learnAffect(checkIns, readings);

    for (const model of [learning.valence, learning.arousal]) {
      if (!model.usable) {
        expect(learning.findings.some((f) => f.includes(model.target === 'valence' ? 'better mood' : 'activated'))).toBe(
          false,
        );
      }
    }
  });
});
