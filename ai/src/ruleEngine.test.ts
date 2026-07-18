import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { evaluateRule, evaluateRules, evaluateLocationRule, evaluateLocationRules, withinTimeWindow } from './ruleEngine.js';
import type { WellnessScores } from './wellness.js';

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
    noon.setUTCHours(12, 0, 0, 0);
    expect(evaluateRule(rule, makeReading(), noon)).toBe(true);
  });

  it('does not match a schedule-only rule outside its window', () => {
    const rule = makeRule({ conditions: [], timeWindow: { start: '09:00', end: '17:00' } });
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    expect(evaluateRule(rule, makeReading(), midnight)).toBe(false);
  });

  it('a rule with both conditions and a timeWindow requires both to match', () => {
    const rule = makeRule({
      conditions: [{ field: 'recoveryScore', operator: 'lt', value: 40 }],
      timeWindow: { start: '09:00', end: '17:00' },
    });
    const noon = new Date();
    noon.setUTCHours(12, 0, 0, 0);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32 }), noon)).toBe(true);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 90 }), noon)).toBe(false);
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    expect(evaluateRule(rule, makeReading({ recoveryScore: 32 }), midnight)).toBe(false);
  });
});

describe('withinTimeWindow', () => {
  // Uses setUTCHours + the default 'UTC' timezone param (rather than
  // setHours/process-local time) so these assertions are deterministic
  // regardless of the machine/CI runner's local timezone.
  it('handles a same-day window', () => {
    const window = { start: '09:00', end: '17:00' };
    const inWindow = new Date();
    inWindow.setUTCHours(10, 0, 0, 0);
    const outOfWindow = new Date();
    outOfWindow.setUTCHours(20, 0, 0, 0);
    expect(withinTimeWindow(window, inWindow)).toBe(true);
    expect(withinTimeWindow(window, outOfWindow)).toBe(false);
  });

  it('handles an overnight-wrapping window', () => {
    const window = { start: '22:00', end: '06:00' };
    const lateNight = new Date();
    lateNight.setUTCHours(23, 0, 0, 0);
    const earlyMorning = new Date();
    earlyMorning.setUTCHours(5, 0, 0, 0);
    const midday = new Date();
    midday.setUTCHours(12, 0, 0, 0);
    expect(withinTimeWindow(window, lateNight)).toBe(true);
    expect(withinTimeWindow(window, earlyMorning)).toBe(true);
    expect(withinTimeWindow(window, midday)).toBe(false);
  });

  it('evaluates in the given timezone rather than the process-local one', () => {
    const window = { start: '09:00', end: '17:00' };
    // 14:30 UTC = 09:30 in America/Chicago (UTC-5 in July) — inside the
    // window in that timezone even though 14:30 itself is not.
    const summerAfternoonUtc = new Date('2026-07-16T14:30:00Z');
    expect(withinTimeWindow(window, summerAfternoonUtc, 'America/Chicago')).toBe(true);
    expect(withinTimeWindow(window, summerAfternoonUtc, 'UTC')).toBe(true);
    expect(withinTimeWindow(window, summerAfternoonUtc, 'Asia/Tokyo')).toBe(false); // 23:30 JST
  });
});

describe('evaluateLocationRule', () => {
  it('matches a pure location rule (no conditions) of the same event type', () => {
    const rule = makeRule({ conditions: [], locationTrigger: 'ARRIVED' });
    expect(evaluateLocationRule(rule, 'ARRIVED')).toBe(true);
  });

  it('does not match a different event type', () => {
    const rule = makeRule({ conditions: [], locationTrigger: 'ARRIVED' });
    expect(evaluateLocationRule(rule, 'DEPARTED')).toBe(false);
  });

  it('does not match a rule with no locationTrigger at all', () => {
    const rule = makeRule({ conditions: [] });
    expect(evaluateLocationRule(rule, 'ARRIVED')).toBe(false);
  });

  it('never matches a disabled rule', () => {
    const rule = makeRule({ conditions: [], locationTrigger: 'ARRIVED', enabled: false });
    expect(evaluateLocationRule(rule, 'ARRIVED')).toBe(false);
  });

  it('respects an additional timeWindow', () => {
    const rule = makeRule({ conditions: [], locationTrigger: 'ARRIVED', timeWindow: { start: '09:00', end: '17:00' } });
    const noon = new Date();
    noon.setUTCHours(12, 0, 0, 0);
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    expect(evaluateLocationRule(rule, 'ARRIVED', noon)).toBe(true);
    expect(evaluateLocationRule(rule, 'ARRIVED', midnight)).toBe(false);
  });

  it('requires a latestReading to check an additional biometric condition, never matching without one', () => {
    const rule = makeRule({
      conditions: [{ field: 'recoveryScore', operator: 'lt', value: 40 }],
      locationTrigger: 'ARRIVED',
    });
    expect(evaluateLocationRule(rule, 'ARRIVED')).toBe(false);
    expect(evaluateLocationRule(rule, 'ARRIVED', new Date(), makeReading({ recoveryScore: 32 }))).toBe(true);
    expect(evaluateLocationRule(rule, 'ARRIVED', new Date(), makeReading({ recoveryScore: 90 }))).toBe(false);
  });
});

describe('evaluateLocationRules', () => {
  it('returns only the rules matching the given event type', () => {
    const arrival = makeRule({ id: 'a', conditions: [], locationTrigger: 'ARRIVED' });
    const departure = makeRule({ id: 'b', conditions: [], locationTrigger: 'DEPARTED' });
    expect(evaluateLocationRules([arrival, departure], 'ARRIVED')).toEqual([arrival]);
  });
});

function makeWellnessScores(overrides: Partial<WellnessScores> = {}): WellnessScores {
  const empty = { value: null, basis: 'heuristic' as const };
  return {
    stress: empty,
    recovery: empty,
    sleep: empty,
    energy: empty,
    fatigue: empty,
    focus: empty,
    relaxation: empty,
    overall: empty,
    ...overrides,
  };
}

describe('wellness-field conditions', () => {
  it('matches a wellness.* condition against the computed score, not the raw reading', () => {
    const rule = makeRule({ conditions: [{ field: 'wellness.stress', operator: 'gt', value: 70 }] });
    const scores = makeWellnessScores({ stress: { value: 85, basis: 'evidence-informed-heuristic' } });
    expect(evaluateRule(rule, makeReading(), new Date(), scores)).toBe(true);
  });

  it('does not match when the computed score is below the threshold', () => {
    const rule = makeRule({ conditions: [{ field: 'wellness.stress', operator: 'gt', value: 70 }] });
    const scores = makeWellnessScores({ stress: { value: 40, basis: 'evidence-informed-heuristic' } });
    expect(evaluateRule(rule, makeReading(), new Date(), scores)).toBe(false);
  });

  it('never matches when no wellnessScores were passed in at all', () => {
    const rule = makeRule({ conditions: [{ field: 'wellness.stress', operator: 'gt', value: 70 }] });
    expect(evaluateRule(rule, makeReading())).toBe(false);
  });

  it('never matches when the score itself is null (couldn\'t be computed)', () => {
    const rule = makeRule({ conditions: [{ field: 'wellness.stress', operator: 'gt', value: 70 }] });
    const scores = makeWellnessScores(); // stress.value is null
    expect(evaluateRule(rule, makeReading(), new Date(), scores)).toBe(false);
  });

  it('AND-combines a wellness.* condition with a raw biometric condition', () => {
    const rule = makeRule({
      conditions: [
        { field: 'wellness.stress', operator: 'gt', value: 70 },
        { field: 'activityLevel', operator: 'lt', value: 20 },
      ],
    });
    const scores = makeWellnessScores({ stress: { value: 85, basis: 'evidence-informed-heuristic' } });
    expect(evaluateRule(rule, makeReading({ activityLevel: 10 }), new Date(), scores)).toBe(true);
    expect(evaluateRule(rule, makeReading({ activityLevel: 50 }), new Date(), scores)).toBe(false);
  });
});
