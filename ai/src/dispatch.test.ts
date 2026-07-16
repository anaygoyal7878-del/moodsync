import { describe, expect, it } from 'vitest';
import type { AutomationRuleDefinition } from '@moodsync/shared';
import { resourceKeyFor, resolveConflicts } from './dispatch.js';

function rule(overrides: Partial<AutomationRuleDefinition> = {}): AutomationRuleDefinition {
  return {
    id: 'r1',
    userId: 'u1',
    name: 'Rule',
    enabled: true,
    conditions: [{ field: 'heartRate', operator: 'gt', value: 85 }],
    actions: [{ type: 'hue.set_brightness', provider: 'hue', params: { deviceId: 'd1', brightness: 30 } }],
    cooldownMinutes: 30,
    priority: 50,
    ...overrides,
  };
}

describe('resourceKeyFor', () => {
  it('derives a coarse provider:actionType key', () => {
    expect(resourceKeyFor({ type: 'hue.set_brightness', provider: 'hue', params: {} })).toBe('hue:set_brightness');
    expect(resourceKeyFor({ type: 'spotify.play_playlist', provider: 'spotify', params: {} })).toBe('spotify:play_playlist');
  });
});

describe('resolveConflicts', () => {
  it('keeps a rule that shares no resource with any other matched rule', () => {
    const only = rule({ id: 'only' });
    const { winners, losers } = resolveConflicts([only]);
    expect(winners).toEqual([only]);
    expect(losers).toHaveLength(0);
  });

  it('picks the higher-priority rule when two rules target the same resource', () => {
    const low = rule({ id: 'low', priority: 20 });
    const high = rule({ id: 'high', priority: 80 });
    const { winners, losers } = resolveConflicts([low, high]);
    expect(winners).toEqual([high]);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ rule: low, winner: high, resourceKey: 'hue:set_brightness' });
  });

  it('does not treat rules targeting different resources as conflicting', () => {
    const hue = rule({ id: 'hue-rule' });
    const spotify = rule({
      id: 'spotify-rule',
      actions: [{ type: 'spotify.play_playlist', provider: 'spotify', params: { playlistUri: 'x' } }],
    });
    const { winners, losers } = resolveConflicts([hue, spotify]);
    expect(winners).toHaveLength(2);
    expect(losers).toHaveLength(0);
  });

  it('breaks a priority tie deterministically by rule id', () => {
    const a = rule({ id: 'a', priority: 50 });
    const b = rule({ id: 'b', priority: 50 });
    const { winners } = resolveConflicts([b, a]);
    expect(winners).toEqual([a]); // 'a' sorts before 'b'
  });
});
