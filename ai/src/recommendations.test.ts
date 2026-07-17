import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition } from '@moodsync/shared';
import { generateRecommendations } from './recommendations.js';
import type { TrendResult } from './insights.js';

function rule(overrides: Partial<AutomationRuleDefinition> = {}): AutomationRuleDefinition {
  return {
    id: 'r1',
    userId: 'u1',
    name: 'Rule',
    enabled: true,
    conditions: [{ field: 'heartRate', operator: 'gt', value: 85 }],
    actions: [{ type: 'hue.set_brightness', provider: 'hue', params: {} }],
    cooldownMinutes: 30,
    priority: 50,
    ...overrides,
  };
}

function trend(metric: string, overrides: Partial<TrendResult> = {}): TrendResult {
  return { metric, current: 70, previous: 40, delta: 30, direction: 'up', ...overrides };
}

describe('generateRecommendations', () => {
  it('suggests Elevated Stress when stress trends up past the threshold and no rule reacts to it', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' })],
      existingRules: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ templateId: 'elevated-stress' });
  });

  it('does not suggest Elevated Stress when a rule already reacts to heartRate', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' })],
      existingRules: [rule({ conditions: [{ field: 'heartRate', operator: 'gt', value: 95 }] })],
    });
    expect(candidates).toHaveLength(0);
  });

  it('does not suggest Elevated Stress when the trend is below threshold or trending down', () => {
    expect(generateRecommendations({ wellnessTrends: [trend('stress', { current: 50, direction: 'up' })], existingRules: [] })).toHaveLength(0);
    expect(generateRecommendations({ wellnessTrends: [trend('stress', { current: 70, direction: 'down' })], existingRules: [] })).toHaveLength(0);
  });

  it('suggests Recovery when recovery trends down past the threshold and no rule reacts to it', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('recovery', { current: 30, direction: 'down' })],
      existingRules: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ templateId: 'recovery' });
  });

  it('does not suggest Recovery when a rule already reacts to activityLevel', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('recovery', { current: 30, direction: 'down' })],
      existingRules: [rule({ conditions: [{ field: 'activityLevel', operator: 'gte', value: 60 }] })],
    });
    expect(candidates).toHaveLength(0);
  });

  it('can suggest both at once and returns none when nothing crosses a threshold', () => {
    const both = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' }), trend('recovery', { current: 30, direction: 'down' })],
      existingRules: [],
    });
    expect(both).toHaveLength(2);

    const none = generateRecommendations({ wellnessTrends: [], existingRules: [] });
    expect(none).toHaveLength(0);
  });
});
