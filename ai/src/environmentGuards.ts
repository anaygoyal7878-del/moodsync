/**
 * Automation guards — the "do not over-automate" layer.
 *
 * The product principle this file exists to enforce: MoodSync should
 * feel like a companion that noticed something, not a system that took
 * control of someone's house. Everything here is a *reason to do
 * nothing*, and the composer's output is only ever allowed through
 * once every guard passes.
 *
 * Guards are pure and ordered by cost — the cheap categorical refusals
 * (paused, quiet hours, away) run before the ones needing history.
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */

export type AutomationLevel =
  /** Detect and suggest. Nothing ever changes on its own. The default,
   * and where every user starts. */
  | 'suggest'
  /** Small, reversible changes to approved channels (lighting, music)
   * without a per-time confirmation. */
  | 'assist'
  /** May also run the user's own approved Apple Home scenes. */
  | 'automate';

export type GuardBlockReason =
  | 'automation_disabled'
  | 'level_requires_confirmation'
  | 'paused'
  | 'quiet_hours'
  | 'cooldown'
  | 'state_too_brief'
  | 'low_confidence'
  | 'recent_manual_override'
  | 'user_away'
  | 'user_asleep'
  | 'active_focus_session'
  | 'in_meeting'
  | 'channel_disabled';

export interface GuardDecision {
  allowed: boolean;
  /** Present when `allowed` is false. One machine-readable reason —
   * the caller logs this so "why didn't MoodSync do anything?" is
   * always answerable after the fact. */
  reason?: GuardBlockReason;
  /** Human-readable, safe to show. */
  explanation?: string;
}

export interface GuardInput {
  level: AutomationLevel;
  automationsEnabled: boolean;
  /** From UserPreferences.automationsPausedUntil — the existing
   * "pause for an hour" control, reused rather than duplicated. */
  pausedUntil: Date | null;
  /** Local hour 0-23 in the user's timezone. */
  localHour: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  /** When MoodSync last applied *anything* for this user. */
  lastAutomationAt: Date | null;
  /** How long the current state has been continuously held. A state
   * that flickered for 30 seconds is noise. */
  stateHeldMinutes: number;
  /** State Engine confidence, 0-1. */
  confidence: number;
  /** When the user last manually changed a device MoodSync also
   * controls. Their intent wins for a while afterward. */
  lastManualOverrideAt: Date | null;
  /** Real signals from the context engine. */
  userAway: boolean;
  userAsleep: boolean;
  inFocusSession: boolean;
  inMeeting: boolean;
  now: Date;
}

/** Minimum gap between two MoodSync-initiated environment changes.
 * The single most important number in this file: it is what stops the
 * app oscillating someone's lights every worker tick. */
export const AUTOMATION_COOLDOWN_MINUTES = 45;

/** A state must be continuously held this long before it can drive an
 * automatic change. Spec section 12: "If stress changes slightly for
 * 30 seconds, DO NOTHING." */
export const MIN_STATE_DURATION_MINUTES = 10;

/** Below this confidence, MoodSync may suggest but never act. */
export const MIN_CONFIDENCE_TO_ACT = 0.6;

/** How long a manual device change suppresses automation. Long enough
 * that MoodSync doesn't immediately undo what someone just did by
 * hand. */
export const MANUAL_OVERRIDE_RESPECT_MINUTES = 90;

function minutesSince(from: Date | null, now: Date): number | null {
  if (!from) return null;
  return (now.getTime() - from.getTime()) / 60_000;
}

/** Handles windows that wrap past midnight (22:00–07:00), same
 * convention as `withinTimeWindow` in ruleEngine.ts. */
function inHourWindow(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Whether MoodSync may **act** right now. A `false` result never means
 * "say nothing" — suggestions are governed separately by
 * `canSuggest` — it means "do not touch a device".
 */
export function canAutomate(input: GuardInput): GuardDecision {
  if (!input.automationsEnabled) {
    return { allowed: false, reason: 'automation_disabled', explanation: 'Automations are turned off.' };
  }

  if (input.level === 'suggest') {
    return {
      allowed: false,
      reason: 'level_requires_confirmation',
      explanation: 'MoodSync is set to suggest only — it will ask before changing anything.',
    };
  }

  if (input.pausedUntil && input.pausedUntil > input.now) {
    return { allowed: false, reason: 'paused', explanation: 'Automations are paused right now.' };
  }

  if (input.quietHoursStart !== null && input.quietHoursEnd !== null && inHourWindow(input.localHour, input.quietHoursStart, input.quietHoursEnd)) {
    return { allowed: false, reason: 'quiet_hours', explanation: 'It’s within your quiet hours.' };
  }

  // Context guards. The user's actual situation outranks any inference
  // about how they're feeling.
  if (input.userAway) {
    return { allowed: false, reason: 'user_away', explanation: 'You’re away from home.' };
  }
  if (input.userAsleep) {
    return { allowed: false, reason: 'user_asleep', explanation: 'You appear to be asleep.' };
  }
  if (input.inMeeting) {
    return { allowed: false, reason: 'in_meeting', explanation: 'You’re in a meeting.' };
  }
  if (input.inFocusSession) {
    return { allowed: false, reason: 'active_focus_session', explanation: 'You’re in a Focus Session — MoodSync won’t interrupt it.' };
  }

  const sinceOverride = minutesSince(input.lastManualOverrideAt, input.now);
  if (sinceOverride !== null && sinceOverride < MANUAL_OVERRIDE_RESPECT_MINUTES) {
    return {
      allowed: false,
      reason: 'recent_manual_override',
      explanation: 'You recently set something yourself — MoodSync is leaving it alone.',
    };
  }

  const sinceLast = minutesSince(input.lastAutomationAt, input.now);
  if (sinceLast !== null && sinceLast < AUTOMATION_COOLDOWN_MINUTES) {
    return {
      allowed: false,
      reason: 'cooldown',
      explanation: `MoodSync adjusted things ${Math.round(sinceLast)} minutes ago and is waiting before doing more.`,
    };
  }

  if (input.stateHeldMinutes < MIN_STATE_DURATION_MINUTES) {
    return {
      allowed: false,
      reason: 'state_too_brief',
      explanation: 'This has only just started — MoodSync waits to be sure.',
    };
  }

  if (input.confidence < MIN_CONFIDENCE_TO_ACT) {
    return { allowed: false, reason: 'low_confidence', explanation: 'MoodSync isn’t confident enough to act on this yet.' };
  }

  return { allowed: true };
}

/**
 * Whether MoodSync may **suggest** right now. Far more permissive than
 * `canAutomate` — a suggestion costs the user a glance, not control of
 * their room — but still silent when they're away, asleep, in a
 * meeting, or inside quiet hours.
 *
 * Deliberately does NOT check the automation cooldown: the cooldown
 * exists to stop devices oscillating, and a card sitting on a
 * dashboard isn't a device. Notification frequency is governed
 * separately by the existing notification dedupe.
 */
export function canSuggest(input: GuardInput): GuardDecision {
  if (input.pausedUntil && input.pausedUntil > input.now) {
    return { allowed: false, reason: 'paused', explanation: 'Automations are paused right now.' };
  }
  if (input.quietHoursStart !== null && input.quietHoursEnd !== null && inHourWindow(input.localHour, input.quietHoursStart, input.quietHoursEnd)) {
    return { allowed: false, reason: 'quiet_hours', explanation: 'It’s within your quiet hours.' };
  }
  if (input.userAsleep) {
    return { allowed: false, reason: 'user_asleep', explanation: 'You appear to be asleep.' };
  }
  if (input.inMeeting) {
    return { allowed: false, reason: 'in_meeting', explanation: 'You’re in a meeting.' };
  }
  if (input.userAway) {
    return { allowed: false, reason: 'user_away', explanation: 'You’re away from home.' };
  }
  return { allowed: true };
}

/**
 * Filters a composed proposal down to what this automation level is
 * actually permitted to execute without asking.
 *
 * - `suggest` executes nothing.
 * - `assist` may do lighting and music — small and trivially
 *   reversible.
 * - `automate` may additionally run the user's own Home scenes.
 *
 * `manual_only` changes (temperature) are never executable at any
 * level, because no write path exists — they stay on the card as
 * advice. See environmentComposer.ts's header.
 */
export function executableChanges<T extends { channel: string; actuation: string }>(changes: T[], level: AutomationLevel): T[] {
  if (level === 'suggest') return [];
  return changes.filter((change) => {
    if (change.actuation === 'manual_only') return false;
    if (change.channel === 'scene') return level === 'automate';
    return change.channel === 'lighting' || change.channel === 'music';
  });
}
