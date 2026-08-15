import { describe, expect, it } from 'vitest';
import {
  composeEnvironment,
  DEFAULT_MAX_LIGHTING_DELTA_PCT,
  DEFAULT_MAX_TEMPERATURE_DELTA_C,
  MIN_AUTOMATED_BRIGHTNESS_PCT,
  type ComposerPreferences,
  type EnvironmentCapabilities,
} from './environmentComposer.js';

function caps(overrides: Partial<EnvironmentCapabilities> = {}): EnvironmentCapabilities {
  return {
    lights: [],
    homeScenes: [],
    musicAvailable: false,
    roomTemperatureC: null,
    roomName: null,
    ...overrides,
  };
}

function prefs(overrides: Partial<ComposerPreferences> = {}): ComposerPreferences {
  return {
    sleepTempMinC: null,
    sleepTempMaxC: null,
    maxLightingDeltaPct: DEFAULT_MAX_LIGHTING_DELTA_PCT,
    maxTemperatureDeltaC: DEFAULT_MAX_TEMPERATURE_DELTA_C,
    lightingEnabled: true,
    musicEnabled: true,
    temperatureEnabled: true,
    sceneEnabled: true,
    musicAlreadyPlaying: false,
    ...overrides,
  };
}

const hueLight = { id: 'l1', name: 'Desk Lamp', provider: 'hue' as const, brightnessPct: 90, supportsColorTemperature: true };

describe('composeEnvironment — never proposes against devices that do not exist', () => {
  it('produces no changes at all for a user with no devices and no music', () => {
    const proposal = composeEnvironment('stressed', caps(), prefs(), 'Reason.');
    expect(proposal.changes).toHaveLength(0);
    expect(proposal.noChangesNeeded).toBe(true);
  });

  it('proposes only lighting for a user whose single device is one light', () => {
    const proposal = composeEnvironment('stressed', caps({ lights: [hueLight] }), prefs(), 'Reason.');
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.changes.every((c) => c.channel === 'lighting')).toBe(true);
  });

  it('never invents a Home scene — only matches ones the user actually has', () => {
    const withScenes = caps({ homeScenes: [{ sceneId: 's1', name: 'Movie Night' }] });
    const proposal = composeEnvironment('stressed', withScenes, prefs(), 'Reason.');
    // "Movie Night" matches none of the relax-intent hints.
    expect(proposal.changes.find((c) => c.channel === 'scene')).toBeUndefined();
  });

  it('runs a real matching scene when the user has one', () => {
    const withScenes = caps({ homeScenes: [{ sceneId: 's1', name: 'Evening Relax' }] });
    const proposal = composeEnvironment('stressed', withScenes, prefs(), 'Reason.');
    const scene = proposal.changes.find((c) => c.channel === 'scene');
    expect(scene?.action?.params.sceneId).toBe('s1');
    expect(scene?.actuation).toBe('queued_to_device');
  });
});

describe('composeEnvironment — gradual change limits', () => {
  it('never exceeds the maximum lighting delta in a single step', () => {
    const proposal = composeEnvironment('sleepy', caps({ lights: [hueLight] }), prefs(), 'Reason.');
    const brightness = proposal.changes.find((c) => c.channel === 'lighting' && c.to !== undefined);
    // Intent wants 30%, current is 90% — a 60-point drop, clamped to 25.
    expect(brightness?.to).toBe(90 - DEFAULT_MAX_LIGHTING_DELTA_PCT);
  });

  it('never turns lights off, even when the intent is a dark room', () => {
    const dim = { ...hueLight, brightnessPct: 20 };
    const proposal = composeEnvironment('sleepy', caps({ lights: [dim] }), prefs({ maxLightingDeltaPct: 100 }), 'Reason.');
    for (const change of proposal.changes) {
      if (change.to !== undefined && change.channel === 'lighting') {
        expect(change.to).toBeGreaterThanOrEqual(MIN_AUTOMATED_BRIGHTNESS_PCT);
      }
    }
  });

  it('skips a no-op rather than proposing a change of one or two percent', () => {
    const alreadyRight = { ...hueLight, brightnessPct: 45 };
    const proposal = composeEnvironment('stressed', caps({ lights: [alreadyRight] }), prefs(), 'Reason.');
    expect(proposal.changes.find((c) => c.channel === 'lighting' && c.to !== undefined)).toBeUndefined();
  });

  it('keeps intensity and colour temperature as separate changes', () => {
    const proposal = composeEnvironment('stressed', caps({ lights: [hueLight] }), prefs(), 'Reason.');
    const lighting = proposal.changes.filter((c) => c.channel === 'lighting');
    expect(lighting.some((c) => c.action?.type === 'hue.set_brightness')).toBe(true);
    expect(lighting.some((c) => c.action?.type === 'hue.set_color_temperature')).toBe(true);
  });
});

describe('composeEnvironment — temperature is advice, never a claimed action', () => {
  it('marks a temperature proposal manual_only with no executable action', () => {
    const warm = caps({ roomTemperatureC: 24, roomName: 'Bedroom' });
    const proposal = composeEnvironment('preparing_for_sleep', warm, prefs({ sleepTempMaxC: 20 }), 'Reason.');
    const temp = proposal.changes.find((c) => c.channel === 'temperature');
    expect(temp).toBeDefined();
    expect(temp!.actuation).toBe('manual_only');
    expect(temp!.action).toBeUndefined();
  });

  it('never recommends a temperature jump larger than the configured limit', () => {
    const veryWarm = caps({ roomTemperatureC: 28, roomName: 'Bedroom' });
    const proposal = composeEnvironment('preparing_for_sleep', veryWarm, prefs({ sleepTempMaxC: 18 }), 'Reason.');
    const temp = proposal.changes.find((c) => c.channel === 'temperature')!;
    // 28°C → clamped to 26.5°C; in Fahrenheit that's 82 → 80.
    const deltaF = Math.abs(temp.to! - temp.from!);
    expect(deltaF).toBeLessThanOrEqual(Math.ceil(DEFAULT_MAX_TEMPERATURE_DELTA_C * 1.8) + 1);
  });

  it('proposes nothing about temperature when the user has set no sleep range', () => {
    const warm = caps({ roomTemperatureC: 26, roomName: 'Bedroom' });
    const proposal = composeEnvironment('preparing_for_sleep', warm, prefs({ sleepTempMaxC: null }), 'Reason.');
    expect(proposal.changes.find((c) => c.channel === 'temperature')).toBeUndefined();
  });
});

describe('composeEnvironment — respects the user', () => {
  it('never proposes taking over music that is already playing', () => {
    const withMusic = caps({ musicAvailable: true });
    const proposal = composeEnvironment('stressed', withMusic, prefs({ musicAlreadyPlaying: true }), 'Reason.');
    expect(proposal.changes.find((c) => c.channel === 'music')).toBeUndefined();
  });

  it('honours per-channel disablement at proposal time, not just at execution', () => {
    const rich = caps({
      lights: [hueLight],
      musicAvailable: true,
      homeScenes: [{ sceneId: 's1', name: 'Relax' }],
    });
    const proposal = composeEnvironment('stressed', rich, prefs({ lightingEnabled: false, musicEnabled: false }), 'Reason.');
    expect(proposal.changes.every((c) => c.channel === 'scene')).toBe(true);
  });

  it('gives every single change a reason', () => {
    const rich = caps({
      lights: [hueLight],
      musicAvailable: true,
      homeScenes: [{ sceneId: 's1', name: 'Relax' }],
      roomTemperatureC: 24,
      roomName: 'Bedroom',
    });
    const proposal = composeEnvironment('preparing_for_sleep', rich, prefs({ sleepTempMaxC: 20 }), 'You’re winding down.');
    expect(proposal.changes.length).toBeGreaterThan(0);
    for (const change of proposal.changes) {
      expect(change.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('composeEnvironment — states with no environment intent', () => {
  it('returns noChangesNeeded for an unknown state rather than guessing', () => {
    const proposal = composeEnvironment('unknown', caps({ lights: [hueLight] }), prefs(), 'Reason.');
    expect(proposal.noChangesNeeded).toBe(true);
    expect(proposal.changes).toHaveLength(0);
  });
});
