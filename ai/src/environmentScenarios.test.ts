import { describe, expect, it } from 'vitest';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { assessState, type StateEngineInput } from './stateEngine.js';
import {
  composeEnvironment,
  DEFAULT_MAX_LIGHTING_DELTA_PCT,
  DEFAULT_MAX_TEMPERATURE_DELTA_C,
  type ComposerPreferences,
  type EnvironmentCapabilities,
} from './environmentComposer.js';
import { canAutomate, canSuggest, executableChanges, type GuardInput } from './environmentGuards.js';

/**
 * The ten end-to-end scenarios from the product spec's FINAL PRODUCT
 * TEST, run against the real engines wired together the way
 * environmentService.ts wires them.
 *
 * These are the tests that would catch a regression in *behaviour*
 * rather than in a unit — e.g. the composer staying correct while the
 * guards start letting it run during a meeting.
 */

const NOW = new Date('2026-08-15T15:00:00Z');

function reading(o: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return { provider: 'whoop', timestamp: NOW.toISOString(), ...o } as NormalizedBiometricReading;
}

function history(count: number, values: Partial<NormalizedBiometricReading>): NormalizedBiometricReading[] {
  return Array.from({ length: count }, (_, i) =>
    reading({ ...values, timestamp: new Date(Date.UTC(2026, 6, 1 + i)).toISOString() }),
  );
}

function stateInput(o: Partial<StateEngineInput> = {}): StateEngineInput {
  return {
    latest: null,
    history: [],
    localHour: 15,
    bookedHoursToday: null,
    inFocusSession: false,
    minutesSinceWorkout: null,
    userDeclaredState: null,
    ...o,
  };
}

function guards(o: Partial<GuardInput> = {}): GuardInput {
  return {
    level: 'assist',
    automationsEnabled: true,
    pausedUntil: null,
    localHour: 15,
    quietHoursStart: null,
    quietHoursEnd: null,
    lastAutomationAt: null,
    stateHeldMinutes: 30,
    confidence: 0.8,
    lastManualOverrideAt: null,
    userAway: false,
    userAsleep: false,
    inFocusSession: false,
    inMeeting: false,
    now: NOW,
    ...o,
  };
}

function caps(o: Partial<EnvironmentCapabilities> = {}): EnvironmentCapabilities {
  return {
    lights: [],
    homeScenes: [],
    musicAvailable: false,
    resolvedPlaylist: null,
    scentSuggestion: null,
    roomTemperatureC: null,
    roomName: null,
    ...o,
  };
}

function prefs(o: Partial<ComposerPreferences> = {}): ComposerPreferences {
  return {
    sleepTempMinC: null,
    sleepTempMaxC: null,
    maxLightingDeltaPct: DEFAULT_MAX_LIGHTING_DELTA_PCT,
    maxTemperatureDeltaC: DEFAULT_MAX_TEMPERATURE_DELTA_C,
    lightingEnabled: true,
    musicEnabled: true,
    temperatureEnabled: true,
    sceneEnabled: true,
    scentEnabled: true,
    musicAlreadyPlaying: false,
    ...o,
  };
}

const RICH_HOME = caps({
  lights: [
    { id: 'l1', name: 'Desk', provider: 'hue', brightnessPct: 95, supportsColorTemperature: true },
    { id: 'l2', name: 'Floor Lamp', provider: 'hue', brightnessPct: 80, supportsColorTemperature: true },
  ],
  homeScenes: [
    { sceneId: 's1', name: 'Evening Relax' },
    { sceneId: 's2', name: 'Focus Time' },
  ],
  musicAvailable: true,
  // A rich home also has a resolvable playlist — music is only proposed
  // when musicResolver.ts found a real, playable URI.
  resolvedPlaylist: { uri: 'spotify:playlist:calm', name: 'Evening Calm', basis: 'name_match' },
  roomTemperatureC: 23,
  roomName: 'Bedroom',
});

describe('Scenario 1 — high-stress study session', () => {
  const assessment = assessState(
    stateInput({
      latest: reading({ heartRate: 96, heartRateVariability: 28 }),
      history: history(40, { heartRate: 64, heartRateVariability: 62 }),
      bookedHoursToday: 6,
    }),
    NOW,
  );

  it('recognises elevated stress from agreeing signals', () => {
    expect(assessment.currentState).toBe('stressed');
    expect(assessment.confidence).toBeGreaterThan(0.6);
  });

  it('proposes a reset that dims rather than blacks out, and explains itself', () => {
    const proposal = composeEnvironment('stressed', RICH_HOME, prefs(), 'Your heart rate is above your usual.');
    expect(proposal.changes.length).toBeGreaterThan(0);
    for (const change of proposal.changes) {
      expect(change.reason).toBeTruthy();
      if (change.to !== undefined && change.channel === 'lighting') expect(change.to).toBeGreaterThan(0);
    }
  });
});

describe('Scenario 2 — normal focused work is not interrupted', () => {
  it('never automates while a focus session is running', () => {
    const decision = canAutomate(guards({ inFocusSession: true, confidence: 0.9 }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('active_focus_session');
  });
});

describe('Scenario 3 — poor sleep morning', () => {
  it('reads low sleep plus low HRV as tired, and proposes more light rather than less', () => {
    const assessment = assessState(
      stateInput({
        latest: reading({ sleepScore: 38, heartRateVariability: 30 }),
        history: history(40, { sleepScore: 82, heartRateVariability: 60 }),
        localHour: 8,
      }),
      NOW,
    );
    expect(assessment.currentState).toBe('tired');

    const dim = caps({ lights: [{ id: 'l1', name: 'Kitchen', provider: 'hue', brightnessPct: 30, supportsColorTemperature: true }] });
    const proposal = composeEnvironment('tired', dim, prefs(), 'You slept less than usual.');
    const brightness = proposal.changes.find((c) => c.channel === 'lighting' && c.to !== undefined);
    expect(brightness!.to).toBeGreaterThan(30);
  });
});

describe('Scenario 4 — preparing for sleep', () => {
  const warmBedroom = caps({
    lights: [{ id: 'l1', name: 'Bedroom', provider: 'hue', brightnessPct: 70, supportsColorTemperature: true }],
    homeScenes: [{ sceneId: 's3', name: 'Wind Down' }],
    roomTemperatureC: 24,
    roomName: 'Bedroom',
  });

  it('offers the user’s own wind-down scene rather than an invented one', () => {
    const proposal = composeEnvironment('preparing_for_sleep', warmBedroom, prefs({ sleepTempMaxC: 20 }), 'It’s late.');
    const scene = proposal.changes.find((c) => c.channel === 'scene');
    expect(scene?.action?.params.sceneId).toBe('s3');
  });

  it('recommends a small temperature drop it is honest about not being able to make', () => {
    const proposal = composeEnvironment('preparing_for_sleep', warmBedroom, prefs({ sleepTempMaxC: 20 }), 'It’s late.');
    const temp = proposal.changes.find((c) => c.channel === 'temperature')!;
    expect(temp.actuation).toBe('manual_only');
    expect(temp.action).toBeUndefined();
  });
});

describe('Scenario 5 — user manually overrides', () => {
  it('backs off entirely for a while after the user countermands it', () => {
    const decision = canAutomate(guards({ lastManualOverrideAt: new Date(NOW.getTime() - 5 * 60_000) }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('recent_manual_override');
  });
});

describe('Scenario 6 — user with no smart-home devices', () => {
  it('still assesses state, but proposes nothing it cannot do', () => {
    const assessment = assessState(
      stateInput({
        latest: reading({ heartRate: 96, heartRateVariability: 28 }),
        history: history(40, { heartRate: 64, heartRateVariability: 62 }),
      }),
      NOW,
    );
    expect(assessment.currentState).toBe('stressed');

    const proposal = composeEnvironment('stressed', caps(), prefs(), 'Reason.');
    expect(proposal.noChangesNeeded).toBe(true);
    expect(proposal.changes).toHaveLength(0);
  });
});

describe('Scenario 7 — user with exactly one device', () => {
  it('produces a proportionate proposal, not a pretend-rich one', () => {
    const single = caps({
      lights: [{ id: 'l1', name: 'Bedside', provider: 'hue', brightnessPct: 90, supportsColorTemperature: false }],
    });
    const proposal = composeEnvironment('sleepy', single, prefs(), 'Reason.');
    expect(proposal.changes.every((c) => c.channel === 'lighting')).toBe(true);
    // No colour-temperature change: this bulb doesn't support it.
    expect(proposal.changes.every((c) => c.action?.type !== 'hue.set_color_temperature')).toBe(true);
  });
});

describe('Scenario 8 — user with several Apple Home devices', () => {
  it('composes a richer environment across every available channel', () => {
    const proposal = composeEnvironment('preparing_for_sleep', RICH_HOME, prefs({ sleepTempMaxC: 20 }), 'Reason.');
    const channels = new Set(proposal.changes.map((c) => c.channel));
    expect(channels.has('lighting')).toBe(true);
    expect(channels.has('music')).toBe(true);
    expect(channels.has('temperature')).toBe(true);
  });

  it('still only runs a scene at AUTOMATE level, and never the temperature advice', () => {
    const proposal = composeEnvironment('stressed', RICH_HOME, prefs(), 'Reason.');
    const assist = executableChanges(proposal.changes, 'assist');
    expect(assist.find((c) => c.channel === 'scene')).toBeUndefined();
    const automate = executableChanges(proposal.changes, 'automate');
    expect(automate.find((c) => c.channel === 'temperature')).toBeUndefined();
  });
});

describe('Scenario 9 — music is already playing', () => {
  it('leaves the user’s music alone', () => {
    const proposal = composeEnvironment('stressed', RICH_HOME, prefs({ musicAlreadyPlaying: true }), 'Reason.');
    expect(proposal.changes.find((c) => c.channel === 'music')).toBeUndefined();
    // Everything else still happens — one unavailable channel doesn't
    // collapse the whole proposal.
    expect(proposal.changes.length).toBeGreaterThan(0);
  });
});

describe('Scenario 10 — user is away from home', () => {
  it('neither acts nor suggests', () => {
    expect(canAutomate(guards({ userAway: true })).allowed).toBe(false);
    expect(canSuggest(guards({ userAway: true })).allowed).toBe(false);
  });
});

describe('Cross-cutting: MoodSync never oscillates a device', () => {
  it('refuses a second change inside the cooldown even when the state still holds', () => {
    const first = canAutomate(guards());
    expect(first.allowed).toBe(true);

    // Immediately afterward, same strong state — must refuse.
    const second = canAutomate(guards({ lastAutomationAt: NOW, confidence: 0.95, stateHeldMinutes: 120 }));
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('refuses to act on a state that flickered for thirty seconds', () => {
    expect(canAutomate(guards({ stateHeldMinutes: 0.5 })).reason).toBe('state_too_brief');
  });
});
