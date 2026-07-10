import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRule, evaluateRules } from './ruleEngine.js';

function makeReading(overrides: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return {
    provider: 'whoop',
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<AutomationRuleDefinition> = {}): AutomationRuleDefinition {
  return {
    id: 'rule-1',
    userId: 'user-1',
    name: 'Low recovery -> wind down',
    enabled: true,
    conditions: [{ field: 'recoveryScore', operator: 'lt', value: 40 }],
    actions: [{ type: 'hue.set_scene', provider: 'hue', params: { scene: 'relax' } }],
    cooldownMinutes: 30,
    ...overrides,
  };
}

describe('evaluateRule', () => {
  it('matches when the condition is satisfied', () => {
    const rule = makeRule();
    const reading = makeReading({ recoveryScore: 32 });
    expect(evaluateRule(rule, reading)).toBe(true);
  });

  it('does not match when the condition is not satisfied', () => {
    const rule = makeRule();
    const reading = makeReading({ recoveryScore: 78 });
    expect(evaluateRule(rule, reading)).toBe(false);
  });

  it('does not match when the referenced field is absent from the reading', () => {
    const rule = makeRule(); // references recoveryScore
    const reading = makeReading({ heartRate: 90 }); // no recoveryScore at all
    expect(evaluateRule(rule, reading)).toBe(false);
  });

  it('requires every condition to match (AND semantics)', () => {
    const rule = makeRule({
      conditions: [
        { field: 'recoveryScore', operator: 'lt', value: 40 },
        { field: 'sleepScore', operator: 'lt', value: 60 },
      ],
    });
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32, sleepScore: 55 }))).toBe(true);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32, sleepScore: 90 }))).toBe(false);
  });

  it('never matches a disabled rule', () => {
    const rule = makeRule({ enabled: false });
    const reading = makeReading({ recoveryScore: 10 });
    expect(evaluateRule(rule, reading)).toBe(false);
  });

  it('never matches a rule with no conditions', () => {
    const rule = makeRule({ conditions: [] });
    expect(evaluateRule(rule, makeReading({ recoveryScore: 10 }))).toBe(false);
  });
});

describe('evaluateRules', () => {
  it('returns only the rules that match', () => {
    const matching = makeRule({ id: 'a', conditions: [{ field: 'recoveryScore', operator: 'lt', value: 40 }] });
    const nonMatching = makeRule({ id: 'b', conditions: [{ field: 'recoveryScore', operator: 'gt', value: 90 }] });
    const reading = makeReading({ recoveryScore: 32 });

    expect(evaluateRules([matching, nonMatching], reading)).toEqual([matching]);
  });
});
