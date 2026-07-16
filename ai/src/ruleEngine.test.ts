import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRule, evaluateRules, withinTimeWindow } from './ruleEngine.js';

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
    priority: 50,
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

describe('timeWindow', () => {
  it('matches a schedule-only rule (no biometric conditions) within its window', () => {
    const rule = makeRule({ conditions: [], timeWindow: { start: '09:00', end: '17:00' } });
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(evaluateRule(rule, makeReading(), noon)).toBe(true);
  });

  it('does not match a schedule-only rule outside its window', () => {
    const rule = makeRule({ conditions: [], timeWindow: { start: '09:00', end: '17:00' } });
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(evaluateRule(rule, makeReading(), midnight)).toBe(false);
  });

  it('a rule with both conditions and a timeWindow requires both to match', () => {
    const rule = makeRule({
      conditions: [{ field: 'recoveryScore', operator: 'lt', value: 40 }],
      timeWindow: { start: '09:00', end: '17:00' },
    });
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32 }), noon)).toBe(true);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 90 }), noon)).toBe(false);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32 }), midnight)).toBe(false);
  });
});

describe('withinTimeWindow', () => {
  it('handles a same-day window', () => {
    const window = { start: '09:00', end: '17:00' };
    const inWindow = new Date();
    inWindow.setHours(10, 0, 0, 0);
    const outOfWindow = new Date();
    outOfWindow.setHours(20, 0, 0, 0);
    expect(withinTimeWindow(window, inWindow)).toBe(true);
    expect(withinTimeWindow(window, outOfWindow)).toBe(false);
  });

  it('handles an overnight-wrapping window', () => {
    const window = { start: '22:00', end: '06:00' };
    const lateNight = new Date();
    lateNight.setHours(23, 0, 0, 0);
    const earlyMorning = new Date();
    earlyMorning.setHours(5, 0, 0, 0);
    const midday = new Date();
    midday.setHours(12, 0, 0, 0);
    expect(withinTimeWindow(window, lateNight)).toBe(true);
    expect(withinTimeWindow(window, earlyMorning)).toBe(true);
    expect(withinTimeWindow(window, midday)).toBe(false);
  });
});
