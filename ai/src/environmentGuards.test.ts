import { describe, expect, it } from 'vitest';
import {
  canAutomate,
  canSuggest,
  executableChanges,
  AUTOMATION_COOLDOWN_MINUTES,
  MIN_STATE_DURATION_MINUTES,
  MANUAL_OVERRIDE_RESPECT_MINUTES,
  type GuardInput,
} from './environmentGuards.js';

const NOW = new Date('2026-08-15T15:00:00Z');

function input(overrides: Partial<GuardInput> = {}): GuardInput {
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
    ...overrides,
  };
}

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

describe('canAutomate — never acts at suggest level', () => {
  it('refuses at suggest level no matter how strong the signal', () => {
    const decision = canAutomate(input({ level: 'suggest', confidence: 0.95, stateHeldMinutes: 300 }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('level_requires_confirmation');
  });

  it('refuses when automations are disabled outright', () => {
    expect(canAutomate(input({ automationsEnabled: false })).reason).toBe('automation_disabled');
  });
});

describe('canAutomate — cooldown prevents repeated device changes', () => {
  it('refuses inside the cooldown window', () => {
    const decision = canAutomate(input({ lastAutomationAt: minutesAgo(AUTOMATION_COOLDOWN_MINUTES - 5) }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('cooldown');
  });

  it('allows once the cooldown has elapsed', () => {
    expect(canAutomate(input({ lastAutomationAt: minutesAgo(AUTOMATION_COOLDOWN_MINUTES + 1) })).allowed).toBe(true);
  });

  it('does nothing for a state that has only just appeared', () => {
    const decision = canAutomate(input({ stateHeldMinutes: 0.5 }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('state_too_brief');
  });

  it('acts once a state has genuinely persisted', () => {
    expect(canAutomate(input({ stateHeldMinutes: MIN_STATE_DURATION_MINUTES + 1 })).allowed).toBe(true);
  });
});

describe('canAutomate — user intent wins', () => {
  it('backs off after the user manually changed something', () => {
    const decision = canAutomate(input({ lastManualOverrideAt: minutesAgo(10) }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('recent_manual_override');
  });

  it('resumes once the manual-override window has passed', () => {
    expect(canAutomate(input({ lastManualOverrideAt: minutesAgo(MANUAL_OVERRIDE_RESPECT_MINUTES + 1) })).allowed).toBe(true);
  });

  it('never interrupts an active focus session', () => {
    expect(canAutomate(input({ inFocusSession: true })).reason).toBe('active_focus_session');
  });

  it('never acts during a meeting', () => {
    expect(canAutomate(input({ inMeeting: true })).reason).toBe('in_meeting');
  });

  it('never acts while the user is away from home', () => {
    expect(canAutomate(input({ userAway: true })).reason).toBe('user_away');
  });

  it('never acts while the user appears to be asleep', () => {
    expect(canAutomate(input({ userAsleep: true })).reason).toBe('user_asleep');
  });
});

describe('canAutomate — confidence and quiet hours', () => {
  it('refuses to act on a low-confidence assessment', () => {
    expect(canAutomate(input({ confidence: 0.3 })).reason).toBe('low_confidence');
  });

  it('respects quiet hours that wrap past midnight', () => {
    expect(canAutomate(input({ quietHoursStart: 22, quietHoursEnd: 7, localHour: 23 })).reason).toBe('quiet_hours');
    expect(canAutomate(input({ quietHoursStart: 22, quietHoursEnd: 7, localHour: 3 })).reason).toBe('quiet_hours');
    expect(canAutomate(input({ quietHoursStart: 22, quietHoursEnd: 7, localHour: 12 })).allowed).toBe(true);
  });

  it('respects an active pause', () => {
    expect(canAutomate(input({ pausedUntil: new Date(NOW.getTime() + 60_000) })).reason).toBe('paused');
  });

  it('ignores an expired pause', () => {
    expect(canAutomate(input({ pausedUntil: minutesAgo(5) })).allowed).toBe(true);
  });
});

describe('canSuggest — more permissive than acting, but still respectful', () => {
  it('suggests at suggest level, where acting is forbidden', () => {
    expect(canSuggest(input({ level: 'suggest' })).allowed).toBe(true);
    expect(canAutomate(input({ level: 'suggest' })).allowed).toBe(false);
  });

  it('suggests inside the automation cooldown — a card is not a device change', () => {
    expect(canSuggest(input({ lastAutomationAt: minutesAgo(1) })).allowed).toBe(true);
  });

  it('stays silent while asleep, in a meeting, away, or in quiet hours', () => {
    expect(canSuggest(input({ userAsleep: true })).allowed).toBe(false);
    expect(canSuggest(input({ inMeeting: true })).allowed).toBe(false);
    expect(canSuggest(input({ userAway: true })).allowed).toBe(false);
    expect(canSuggest(input({ quietHoursStart: 22, quietHoursEnd: 7, localHour: 2 })).allowed).toBe(false);
  });
});

describe('executableChanges — level gating', () => {
  const changes = [
    { channel: 'lighting', actuation: 'automatic' },
    { channel: 'music', actuation: 'automatic' },
    { channel: 'scene', actuation: 'queued_to_device' },
    { channel: 'temperature', actuation: 'manual_only' },
  ];

  it('executes nothing at suggest level', () => {
    expect(executableChanges(changes, 'suggest')).toHaveLength(0);
  });

  it('executes lighting and music but not scenes at assist level', () => {
    const result = executableChanges(changes, 'assist');
    expect(result.map((c) => c.channel).sort()).toEqual(['lighting', 'music']);
  });

  it('adds scenes at automate level', () => {
    const result = executableChanges(changes, 'automate');
    expect(result.map((c) => c.channel).sort()).toEqual(['lighting', 'music', 'scene']);
  });

  it('never executes a manual_only change at any level', () => {
    for (const level of ['suggest', 'assist', 'automate'] as const) {
      expect(executableChanges(changes, level).find((c) => c.channel === 'temperature')).toBeUndefined();
    }
  });
});
