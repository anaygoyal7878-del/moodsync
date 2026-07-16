import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { explainTrigger, explainConflict, explainManualPause, explainRateLimit } from './explain.js';

function rule(overrides: Partial<AutomationRuleDefinition> = {}): AutomationRuleDefinition {
  return {
    id: 'r1',
    userId: 'u1',
    name: 'Elevated Stress',
    enabled: true,
    conditions: [{ field: 'heartRate', operator: 'gt', value: 85 }],
    actions: [],
    cooldownMinutes: 30,
    priority: 50,
    ...overrides,
  };
}

const reading: NormalizedBiometricReading = {
  provider: 'apple_health',
  userId: 'u1',
  timestamp: new Date().toISOString(),
  heartRate: 92,
  heartRateVariability: 28,
};

describe('explainTrigger', () => {
  it('describes a single condition with the actual value', () => {
    const text = explainTrigger(rule(), reading);
    expect(text).toContain('92');
    expect(text).toContain('heart rate');
    expect(text).toContain('exceeded');
    expect(text).toContain('85');
  });

  it('joins multiple conditions with "and"', () => {
    const text = explainTrigger(
      rule({ conditions: [{ field: 'heartRate', operator: 'gt', value: 85 }, { field: 'stressLevel', operator: 'gte', value: 60 }] }),
      reading,
    );
    expect(text).toContain(' and ');
  });

  it('mentions the time window when present', () => {
    const text = explainTrigger(rule({ timeWindow: { start: '09:00', end: '17:00' } }), reading);
    expect(text).toContain('09:00-17:00');
  });

  it('falls back to a time-window-only explanation for schedule-triggered rules with no conditions', () => {
    const text = explainTrigger(rule({ conditions: [], timeWindow: { start: '22:00', end: '23:00' } }), reading);
    expect(text).toContain('scheduled time window');
  });
});

describe('explainConflict / explainManualPause / explainRateLimit', () => {
  it('names both rules and the resource', () => {
    const text = explainConflict(rule({ name: 'Losing', priority: 20 }), rule({ name: 'Winning', priority: 80 }), 'hue:brightness');
    expect(text).toContain('Winning');
    expect(text).toContain('Losing');
    expect(text).toContain('hue:brightness');
  });

  it('formats a manual pause explanation', () => {
    expect(explainManualPause(new Date().toISOString())).toContain('paused until');
  });

  it('formats a rate-limit explanation', () => {
    expect(explainRateLimit(rule(), 10)).toContain('10');
  });
});
