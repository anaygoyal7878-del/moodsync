import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { computeTrends, computeAutomationEffectiveness } from './insights.js';

function makeReading(overrides: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return { provider: 'whoop', userId: 'user-1', timestamp: new Date().toISOString(), ...overrides };
}

function makeRule(overrides: Partial<AutomationRuleDefinition> = {}): AutomationRuleDefinition {
  return {
    id: 'rule-1',
    userId: 'user-1',
    name: 'Wind down when recovery is low',
    enabled: true,
    conditions: [{ field: 'recoveryScore', operator: 'lt', value: 50 }],
    actions: [{ type: 'hue.set_brightness', provider: 'hue', params: { deviceId: 'd1', brightness: 30 } }],
    cooldownMinutes: 30,
    priority: 50,
    ...overrides,
  };
}

describe('computeTrends', () => {
  it('returns nothing for fewer than two readings', () => {
    expect(computeTrends([])).toEqual([]);
    expect(computeTrends([makeReading({ recoveryScore: 50 })])).toEqual([]);
  });

  it('compares the average of the newer half against the older half', () => {
    const readings = [
      makeReading({ recoveryScore: 40 }),
      makeReading({ recoveryScore: 40 }),
      makeReading({ recoveryScore: 60 }),
      makeReading({ recoveryScore: 60 }),
    ];
    const result = computeTrends(readings);
    const recovery = result.find((r) => r.metric === 'recoveryScore');
    expect(recovery).toMatchObject({ previous: 40, current: 60, delta: 20, direction: 'up' });
  });

  it('classifies a small delta as flat rather than up/down', () => {
    const readings = [makeReading({ heartRate: 60 }), makeReading({ heartRate: 60.2 })];
    const result = computeTrends(readings);
    expect(result.find((r) => r.metric === 'heartRate')?.direction).toBe('flat');
  });

  it('skips a metric missing from either half', () => {
    const readings = [makeReading({ steps: 5000 }), makeReading({ recoveryScore: 60 })];
    const result = computeTrends(readings);
    expect(result.find((r) => r.metric === 'steps')).toBeUndefined();
    expect(result.find((r) => r.metric === 'recoveryScore')).toBeUndefined();
  });
});

describe('computeAutomationEffectiveness', () => {
  it('marks an execution as improved when a "lt" rule\'s metric rises afterward', () => {
    const rule = makeRule();
    const trigger = { id: 'r1', reading: makeReading({ recoveryScore: 30, timestamp: '2026-07-10T08:00:00Z' }) };
    const next = { id: 'r2', reading: makeReading({ recoveryScore: 55, timestamp: '2026-07-10T20:00:00Z' }) };

    const result = computeAutomationEffectiveness({
      rules: [rule],
      logs: [{ ruleId: rule.id, triggerReadingId: 'r1', outcome: 'EXECUTED' }],
      readings: [trigger, next],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: rule.id,
      metric: 'recoveryScore',
      executedCount: 1,
      comparableCount: 1,
      improvedCount: 1,
      effectivenessRate: 100,
    });
  });

  it('marks an execution as not improved when the metric does not move favorably', () => {
    const rule = makeRule();
    const trigger = { id: 'r1', reading: makeReading({ recoveryScore: 30, timestamp: '2026-07-10T08:00:00Z' }) };
    const next = { id: 'r2', reading: makeReading({ recoveryScore: 20, timestamp: '2026-07-10T20:00:00Z' }) };

    const result = computeAutomationEffectiveness({
      rules: [rule],
      logs: [{ ruleId: rule.id, triggerReadingId: 'r1', outcome: 'EXECUTED' }],
      readings: [trigger, next],
    });

    expect(result[0]).toMatchObject({ comparableCount: 1, improvedCount: 0, effectivenessRate: 0 });
  });

  it('flips improvement direction for a "gt" rule (wants the value to go down)', () => {
    const rule = makeRule({ conditions: [{ field: 'stressLevel', operator: 'gt', value: 70 }] });
    const trigger = { id: 'r1', reading: makeReading({ stressLevel: 85, timestamp: '2026-07-10T08:00:00Z' }) };
    const next = { id: 'r2', reading: makeReading({ stressLevel: 50, timestamp: '2026-07-10T20:00:00Z' }) };

    const result = computeAutomationEffectiveness({
      rules: [rule],
      logs: [{ ruleId: rule.id, triggerReadingId: 'r1', outcome: 'EXECUTED' }],
      readings: [trigger, next],
    });

    expect(result[0]).toMatchObject({ improvedCount: 1, effectivenessRate: 100 });
  });

  it('reports a null rate when no comparable pair exists yet', () => {
    const rule = makeRule();
    const result = computeAutomationEffectiveness({
      rules: [rule],
      logs: [{ ruleId: rule.id, triggerReadingId: 'missing', outcome: 'EXECUTED' }],
      readings: [],
    });
    expect(result[0]).toMatchObject({ executedCount: 1, comparableCount: 0, effectivenessRate: null });
  });

  it('ignores skipped and failed executions', () => {
    const rule = makeRule();
    const result = computeAutomationEffectiveness({
      rules: [rule],
      logs: [
        { ruleId: rule.id, triggerReadingId: 'r1', outcome: 'SKIPPED_COOLDOWN' },
        { ruleId: rule.id, triggerReadingId: 'r1', outcome: 'FAILED' },
      ],
      readings: [],
    });
    expect(result).toHaveLength(0);
  });
});
