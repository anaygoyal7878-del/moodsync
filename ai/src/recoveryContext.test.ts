import { describe, it, expect } from 'vitest';
import { buildRecoveryContext, type RecoveryContextInput } from './recoveryContext.js';
import type { PersonalBaselines, BaselineComparison } from './personalBaselines.js';
import { EVIDENCE_SOURCES, sourceById } from './evidenceSources.js';

const cmp = (value: number, baseline: number, z: number, sampleSize = 30): BaselineComparison => ({
  value,
  baseline,
  z,
  sampleSize,
});

function baselines(over: Partial<PersonalBaselines> = {}): PersonalBaselines {
  return {
    heartRate: null,
    restingHeartRate: null,
    heartRateVariability: null,
    sleepScore: null,
    activityLevel: null,
    hasAnyBaseline: true,
    maxSampleSize: 30,
    ...over,
  };
}

const input = (over: Partial<RecoveryContextInput> = {}): RecoveryContextInput => ({
  baselines: baselines(),
  sleepMinutes: null,
  age: null,
  ...over,
});

describe('1. good sleep + normal HRV + normal resting HR', () => {
  it('does not manufacture a concern', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          heartRateVariability: cmp(62, 61, 0.1),
          restingHeartRate: cmp(52, 52, 0),
          activityLevel: cmp(55, 55, 0),
        }),
        sleepMinutes: 8 * 60,
      }),
    );
    expect(['normal', 'recovering-well']).toContain(result.state);
    expect(result.guidance).toMatch(/usual|normal|nothing/i);
  });
});

describe('2. poor sleep + elevated resting HR', () => {
  it('raises higher-need on two agreeing signals', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          restingHeartRate: cmp(59, 52, 2.0),
          heartRateVariability: cmp(61, 61, 0),
          activityLevel: cmp(55, 55, 0),
        }),
        sleepMinutes: 5 * 60 + 30,
      }),
    );
    expect(result.state).toBe('higher-need');
    expect(result.headline).toMatch(/lighter day/i);
  });
});

describe('3. poor sleep + low HRV + high activity', () => {
  it('raises priority when three signals move together', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          heartRateVariability: cmp(41, 61, -1.8),
          restingHeartRate: cmp(53, 52, 0.3),
          activityLevel: cmp(88, 55, 1.9),
        }),
        sleepMinutes: 5 * 60,
      }),
    );
    expect(result.state).toBe('priority');
    expect(result.guidance).toMatch(/easy day|early night/i);
  });
});

describe('4. low HRV alone', () => {
  it('never escalates on one signal — a single low morning is ordinary', () => {
    // The specific failure this system replaces: "HRV below X = poor
    // recovery". One signal must not become a verdict.
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          heartRateVariability: cmp(41, 61, -1.8),
          restingHeartRate: cmp(52, 52, 0),
          activityLevel: cmp(55, 55, 0),
        }),
        sleepMinutes: 8 * 60,
      }),
    );
    expect(result.state).toBe('normal');
  });
});

describe('5. elevated resting HR alone', () => {
  it('also stays at normal', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          restingHeartRate: cmp(58, 52, 1.9),
          heartRateVariability: cmp(61, 61, 0),
          activityLevel: cmp(55, 55, 0),
        }),
        sleepMinutes: 8 * 60,
      }),
    );
    expect(result.state).toBe('normal');
  });
});

describe('6. missing HRV', () => {
  it('reports HRV as unknown and still reads the signals it has', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ restingHeartRate: cmp(59, 52, 2.0), activityLevel: cmp(55, 55, 0) }),
        sleepMinutes: 5 * 60,
      }),
    );
    const hrv = result.signals.find((s) => s.id === 'hrv')!;
    expect(hrv.direction).toBe('unknown');
    expect(hrv.suggestsRecovery).toBeNull();
    expect(result.state).toBe('higher-need');
  });
});

describe('7. missing sleep data', () => {
  it('says so rather than treating absent sleep as good sleep', () => {
    const result = buildRecoveryContext(
      input({ baselines: baselines({ heartRateVariability: cmp(61, 61, 0), restingHeartRate: cmp(52, 52, 0) }) }),
    );
    const sleep = result.signals.find((s) => s.id === 'sleep')!;
    expect(sleep.direction).toBe('unknown');
    expect(sleep.comparison).toMatch(/no sleep data/i);
  });

  it('falls back to sleep quality when duration is unavailable, and labels it as quality', () => {
    // Duration and quality are different claims and must not be
    // presented as the same one.
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          sleepScore: cmp(55, 80, -1.9),
          heartRateVariability: cmp(61, 61, 0),
          restingHeartRate: cmp(52, 52, 0),
        }),
      }),
    );
    const sleep = result.signals.find((s) => s.id === 'sleep')!;
    expect(sleep.label).toBe('Sleep quality');
    expect(sleep.suggestsRecovery).toBe(true);
  });
});

describe('8. new user with insufficient baseline', () => {
  it('says MoodSync is still learning instead of giving a confident answer', () => {
    const result = buildRecoveryContext(
      input({ baselines: baselines({ heartRateVariability: cmp(58, 60, -0.4, 3), hasAnyBaseline: false, maxSampleSize: 3 }) }),
    );
    expect(result.state).toBe('insufficient-data');
    expect(result.confidence).toBe('low');
    expect(result.headline).toMatch(/still learning/i);
  });
});

describe('9. conflicting signals', () => {
  it('lowers confidence and says the signals disagree', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          heartRateVariability: cmp(75, 61, 1.6), // reassuring
          restingHeartRate: cmp(59, 52, 2.0), // flagging
          activityLevel: cmp(55, 55, 0),
        }),
        sleepMinutes: 8 * 60,
      }),
    );
    expect(result.confidence).not.toBe('high');
    expect(result.confidenceReason).toMatch(/disagree/i);
  });
});

describe('10. poor-quality / thin wearable data', () => {
  it('caps confidence when a comparison rests on very few readings', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({
          heartRateVariability: cmp(41, 61, -1.8, 6),
          restingHeartRate: cmp(59, 52, 2.0, 6),
          activityLevel: cmp(55, 55, 0, 6),
        }),
        sleepMinutes: 5 * 60,
      }),
    );
    expect(result.confidence).toBe('moderate');
    expect(result.confidenceReason).toMatch(/short history/i);
  });
});

describe('guardrails that must hold in every case', () => {
  const cases: RecoveryContextInput[] = [
    input({ baselines: baselines({ heartRateVariability: cmp(41, 61, -1.8), restingHeartRate: cmp(59, 52, 2) }), sleepMinutes: 4 * 60 }),
    input({ baselines: baselines({ heartRateVariability: cmp(75, 61, 1.6), restingHeartRate: cmp(48, 52, -1.5) }), sleepMinutes: 9 * 60 }),
    input(),
  ];

  it('never diagnoses and never issues a medical instruction', () => {
    for (const c of cases) {
      const r = buildRecoveryContext(c);
      expect(r.isDiagnostic).toBe(false);
      expect(r.guidance).not.toMatch(/\b(diagnos|prescrib|medication|you are (ill|sick|injured)|treatment)\b/i);
      expect(r.headline).not.toMatch(/\b(you are (ill|sick|injured)|overtrained)\b/i);
    }
  });

  it('never promises an outcome', () => {
    for (const c of cases) {
      const r = buildRecoveryContext(c);
      expect(r.guidance).not.toMatch(/\b(will (improve|fix|restore|boost)|guarantee)\b/i);
    }
  });

  it('cites only sources that exist in the register', () => {
    for (const c of cases) {
      for (const id of buildRecoveryContext(c).sourceIds) {
        expect(sourceById(id), `unknown source id: ${id}`).toBeDefined();
      }
    }
  });

  it('always reports every signal, present or not', () => {
    for (const c of cases) {
      expect(buildRecoveryContext(c).signals.map((s) => s.id).sort()).toEqual([
        'activity',
        'hrv',
        'resting-heart-rate',
        'sleep',
        'training-load',
      ]);
    }
  });
});

describe('age-appropriate sleep band', () => {
  it('uses the AASM teen band for a 16-year-old', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ heartRateVariability: cmp(61, 61, 0), restingHeartRate: cmp(52, 52, 0) }),
        sleepMinutes: 7 * 60 + 30,
        age: 16,
      }),
    );
    const sleep = result.signals.find((s) => s.id === 'sleep')!;
    // 7h30m is inside the adult band and below the teen band — the
    // whole reason age is threaded through at all.
    expect(sleep.direction).toBe('below');
    expect(result.sourceIds).toContain('aasm-teen-sleep');
  });

  it('uses the adult band when age is unknown', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ heartRateVariability: cmp(61, 61, 0), restingHeartRate: cmp(52, 52, 0) }),
        sleepMinutes: 7 * 60 + 30,
      }),
    );
    expect(result.signals.find((s) => s.id === 'sleep')!.direction).toBe('typical');
    expect(result.sourceIds).toContain('cdc-sleep');
  });
});

describe('evidence register', () => {
  it('records what each source actually supports, and its limits', () => {
    for (const source of EVIDENCE_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.supports.length).toBeGreaterThan(30);
      expect(source.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('states the wearable-accuracy limitation, since every signal here rests on PPG', () => {
    const ppg = EVIDENCE_SOURCES.filter((s) => s.topic === 'wearable-accuracy');
    expect(ppg.length).toBeGreaterThanOrEqual(2);
    expect(ppg.some((s) => /ECG/i.test(s.limits ?? ''))).toBe(true);
  });
});

describe('training load', () => {
  const load = (ratio: number | null, rated = 4, unrated = 0) => ({
    acuteLoad: ratio === null ? 0 : ratio * 600,
    typicalWeeklyLoad: ratio === null ? null : 600,
    ratio,
    ratedSessionsThisWeek: rated,
    unratedSessionsThisWeek: unrated,
  });
  const steady = baselines({ heartRateVariability: cmp(61, 61, 0), restingHeartRate: cmp(52, 52, 0), activityLevel: cmp(55, 55, 0) });

  it('flags a week well above the usual as recovery context', () => {
    const result = buildRecoveryContext(input({ baselines: steady, sleepMinutes: 8 * 60, trainingLoad: load(1.5) }));
    const signal = result.signals.find((s) => s.id === 'training-load')!;
    expect(signal.suggestsRecovery).toBe(true);
    expect(signal.comparison).toMatch(/50% more than your usual week/);
  });

  it('does not escalate on heavy training alone', () => {
    // A hard week on its own is ordinary training, not a recovery verdict.
    const result = buildRecoveryContext(input({ baselines: steady, sleepMinutes: 8 * 60, trainingLoad: load(1.6) }));
    expect(result.state).toBe('normal');
  });

  it('escalates when heavy training coincides with an independent signal', () => {
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ heartRateVariability: cmp(41, 61, -1.8), restingHeartRate: cmp(52, 52, 0), activityLevel: cmp(55, 55, 0) }),
        sleepMinutes: 8 * 60,
        trainingLoad: load(1.6),
      }),
    );
    expect(result.state).toBe('higher-need');
  });

  it('counts wearable activity and logged load as one cause, not two', () => {
    // Both describe the same hard week. Counting them separately would
    // let one cause escalate the state by itself.
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ heartRateVariability: cmp(61, 61, 0), restingHeartRate: cmp(52, 52, 0), activityLevel: cmp(88, 55, 1.9) }),
        sleepMinutes: 8 * 60,
        trainingLoad: load(1.6),
      }),
    );
    expect(result.signals.filter((s) => s.suggestsRecovery === true)).toHaveLength(2);
    expect(result.state).toBe('normal');
  });

  it('says why load is unknown when workouts were logged without effort ratings', () => {
    const result = buildRecoveryContext(input({ baselines: steady, trainingLoad: load(null, 0, 3) }));
    const signal = result.signals.find((s) => s.id === 'training-load')!;
    expect(signal.direction).toBe('unknown');
    expect(signal.comparison).toMatch(/3 workouts this week had no effort rating/);
  });

  it('treats a lighter week as neutral, not as proof of recovery', () => {
    const result = buildRecoveryContext(input({ baselines: steady, trainingLoad: load(0.5) }));
    const signal = result.signals.find((s) => s.id === 'training-load')!;
    expect(signal.direction).toBe('below');
    expect(signal.suggestsRecovery).toBeNull();
  });
});

describe('training load and confidence', () => {
  it('does not read a normal week of three sessions as thin history', () => {
    // sessionCount for load means sessions this week, not readings behind
    // a baseline — three is a full week, and must not drag confidence down.
    const result = buildRecoveryContext(
      input({
        baselines: baselines({ heartRateVariability: cmp(41, 61, -1.8, 30), restingHeartRate: cmp(52, 52, 0, 30), activityLevel: cmp(55, 55, 0, 30) }),
        sleepMinutes: 8 * 60,
        trainingLoad: { acuteLoad: 720, typicalWeeklyLoad: 360, ratio: 2, ratedSessionsThisWeek: 3, unratedSessionsThisWeek: 0 },
      }),
    );
    expect(result.confidence).not.toBe('low');
  });
});
