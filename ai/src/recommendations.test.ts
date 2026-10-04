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
  it('suggests a breathing session when stress trends up past the threshold', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' })],
      existingRules: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'open', href: '/dashboard/meditation' });
    expect(candidates[0]!.description).toMatch(/trended up recently \(40 → 70\)/);
  });

  it('does not suggest anything for stress below threshold or trending down', () => {
    expect(generateRecommendations({ wellnessTrends: [trend('stress', { current: 50, direction: 'up' })], existingRules: [] })).toHaveLength(0);
    expect(generateRecommendations({ wellnessTrends: [trend('stress', { current: 70, direction: 'down' })], existingRules: [] })).toHaveLength(0);
  });

  it('suggests calm music when recovery trends down past the threshold', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('recovery', { current: 30, direction: 'down' })],
      existingRules: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'open', href: '/dashboard/music' });
  });

  it('never points at a rule template that no longer exists', () => {
    // Regression: stress/recovery pointed at Hue templates removed from
    // the UI along with Hue, so accepting led nowhere.
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 80, direction: 'up' }), trend('recovery', { current: 20, direction: 'down' })],
      existingRules: [],
      currentScores: { stress: 100, recovery: 0 },
    });
    expect(candidates.some((c) => c.kind === 'template')).toBe(false);
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

  it('flags a playlist with a high skip rate and enough samples', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [],
      existingRules: [],
      playlistSkipStats: [
        { ruleId: 'r1', ruleName: 'Wind Down', playlistUri: 'spotify:playlist:abc', skipRate: 0.8, sampleSize: 5 },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'edit-rule', ruleId: 'r1' });
  });

  it('does not flag a playlist below the sample-size floor even with a high skip rate', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [],
      existingRules: [],
      playlistSkipStats: [
        { ruleId: 'r1', ruleName: 'Wind Down', playlistUri: 'spotify:playlist:abc', skipRate: 1, sampleSize: 3 },
      ],
    });
    expect(candidates).toHaveLength(0);
  });

  it('does not flag a playlist below the skip-rate threshold', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [],
      existingRules: [],
      playlistSkipStats: [
        { ruleId: 'r1', ruleName: 'Wind Down', playlistUri: 'spotify:playlist:abc', skipRate: 0.4, sampleSize: 10 },
      ],
    });
    expect(candidates).toHaveLength(0);
  });
});

describe('generateRecommendations — run-scene', () => {
  it('suggests running a cached "Wind Down" scene when stress trends up and a matching scene exists', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' })],
      existingRules: [],
      cachedScenes: [{ sceneId: 'scene-1', name: 'Wind Down' }],
    });
    const runScene = candidates.find((c) => c.kind === 'run-scene');
    expect(runScene).toMatchObject({ kind: 'run-scene', sceneId: 'scene-1', sceneName: 'Wind Down' });
  });

  it('does not suggest a scene when no cached scene name matches a relax keyword', () => {
    const candidates = generateRecommendations({
      wellnessTrends: [trend('stress', { current: 70, direction: 'up' })],
      existingRules: [],
      cachedScenes: [{ sceneId: 'scene-1', name: 'Movie Night' }],
    });
    expect(candidates.find((c) => c.kind === 'run-scene')).toBeUndefined();
  });
});

describe('generateRecommendations — acute state', () => {
  // Two hard days inside a calm fortnight: the weekly averages sit just
  // under the trend thresholds while the latest reading is extreme.
  const diluted = [trend('stress', { current: 60, direction: 'up' }), trend('recovery', { current: 41, direction: 'down' })];

  it('stayed silent on weekly averages alone — the original blind spot', () => {
    expect(generateRecommendations({ wellnessTrends: diluted, existingRules: [] })).toHaveLength(0);
  });

  it('responds to an extreme latest reading even when the averages have not moved', () => {
    const candidates = generateRecommendations({
      wellnessTrends: diluted,
      existingRules: [],
      currentScores: { stress: 100, recovery: 0 },
    });
    expect(candidates.map((c) => c.href)).toEqual(['/dashboard/meditation', '/dashboard/music']);
    // Quotes the reading that fired, not a contradictory weekly average.
    expect(candidates[0]!.description).toMatch(/latest Stress reading is 100/);
    expect(candidates[1]!.description).toMatch(/latest Recovery reading is 0/);
  });

  it('holds a single reading to a stricter bar than a weekly trend', () => {
    // 70 would trigger as a weekly trend (>= 65) but not as one reading.
    expect(
      generateRecommendations({ wellnessTrends: [], existingRules: [], currentScores: { stress: 70, recovery: 35 } }),
    ).toHaveLength(0);
  });

  it('ignores missing scores', () => {
    expect(
      generateRecommendations({ wellnessTrends: [], existingRules: [], currentScores: { stress: null, recovery: null } }),
    ).toHaveLength(0);
  });
});
