import type { WellnessScore, WellnessScores } from './wellness.js';

/**
 * The Daily Brief — MoodSync's home experience. Composes the signals
 * this app already computes into the handful of sentences a person
 * actually wants when they open the app: how ready they are, what
 * changed since yesterday, what today is good for, what it isn't, and
 * one or two things worth doing.
 *
 * Every sentence here is derived from a real measurement and carries its
 * own reason. Nothing is templated encouragement — when there's no
 * signal, the brief says there's no signal rather than filling the space
 * with something warm and empty.
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDayFor(hour: number): TimeOfDay {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

export function greetingFor(timeOfDay: TimeOfDay, firstName: string | null): string {
  const who = firstName ? `, ${firstName}` : '';
  switch (timeOfDay) {
    case 'morning':
      return `Good morning${who}`;
    case 'afternoon':
      return `Good afternoon${who}`;
    case 'evening':
      return `Good evening${who}`;
    case 'night':
      return `Still up${who}`;
  }
}

/**
 * Readiness (0-100) — deliberately distinct from the Live Energy Meter.
 * Energy is a *right now* number that moves through the day and
 * responds to caffeine; readiness is a *today* number set by how the
 * night went, answering "how much load can I take on." Recovery and
 * sleep are the only inputs, weighted toward recovery, because those
 * are the two signals that are genuinely about overnight preparation.
 *
 * Returns null with neither available — this app doesn't produce a
 * readiness number without a night's data behind it.
 */
export function computeReadiness(scores: Pick<WellnessScores, 'recovery' | 'sleep'>): WellnessScore {
  const weighted: Array<{ value: number; weight: number }> = [];
  if (scores.recovery.value !== null) weighted.push({ value: scores.recovery.value, weight: 0.6 });
  if (scores.sleep.value !== null) weighted.push({ value: scores.sleep.value, weight: 0.4 });
  if (weighted.length === 0) return { value: null, basis: 'heuristic' };

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const value = Math.round(weighted.reduce((sum, w) => sum + w.value * w.weight, 0) / totalWeight);
  return { value: Math.max(0, Math.min(100, value)), basis: 'heuristic' };
}

export type ReadinessBand = 'primed' | 'steady' | 'depleted';

export function readinessBand(value: number): ReadinessBand {
  if (value >= 67) return 'primed';
  if (value >= 40) return 'steady';
  return 'depleted';
}

export interface OvernightChange {
  metric: 'sleep' | 'recovery';
  /** Points above or below this user's own recent average. */
  delta: number;
  sentence: string;
}

/** Below this many points, a night is just a normal night — reporting
 * every ±2 point wobble as "what changed" trains people to ignore it. */
const NOTABLE_DELTA = 6;

/**
 * "What changed overnight" — last night against the user's own trailing
 * average, for the two metrics that are genuinely overnight measures.
 * Returns an empty array when nothing moved meaningfully, and the UI
 * says so plainly rather than manufacturing a change.
 */
export function computeOvernightChanges(
  latest: { sleep: number | null; recovery: number | null },
  baseline: { sleep: number | null; recovery: number | null },
): OvernightChange[] {
  const changes: OvernightChange[] = [];

  if (latest.sleep !== null && baseline.sleep !== null) {
    const delta = Math.round(latest.sleep - baseline.sleep);
    if (Math.abs(delta) >= NOTABLE_DELTA) {
      changes.push({
        metric: 'sleep',
        delta,
        sentence:
          delta > 0
            ? `You slept ${delta} points better than your recent average.`
            : `You slept ${Math.abs(delta)} points worse than your recent average.`,
      });
    }
  }

  if (latest.recovery !== null && baseline.recovery !== null) {
    const delta = Math.round(latest.recovery - baseline.recovery);
    if (Math.abs(delta) >= NOTABLE_DELTA) {
      changes.push({
        metric: 'recovery',
        delta,
        sentence:
          delta > 0
            ? `Your recovery came back ${delta} points above your average.`
            : `Your recovery is ${Math.abs(delta)} points below your average.`,
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export type BriefActionKind = 'focus' | 'walk' | 'wind-down' | 'recovery' | 'hydrate' | 'plan';

export interface BriefAction {
  kind: BriefActionKind;
  label: string;
  reason: string;
  /** In-app destination this action opens, so the brief is one tap from
   * doing rather than a wall of advice. */
  href: string;
}

export interface DailyBriefInput {
  timeOfDay: TimeOfDay;
  readiness: number | null;
  energy: number | null;
  /** Whether burnout detection is currently firing — the strongest
   * single override in the brief. */
  burnoutRisk: boolean;
  /** Suggested study/focus window from the calendar-backed planner,
   * null when no calendar is connected or nothing is free. */
  focusWindow: { start: Date; end: Date } | null;
  /** Hours booked in today's calendar, null when no calendar. */
  bookedHoursToday: number | null;
}

export interface DailyBrief {
  focusToday: string;
  avoidToday: string | null;
  actions: BriefAction[];
}

function formatWindow(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)}–${fmt(end)}`;
}

/**
 * The judgement calls at the centre of the brief. Ordered by how strong
 * the signal is: burnout risk overrides everything, then depleted
 * readiness, then time of day and available focus windows. Each branch
 * produces guidance tied to the specific reason that triggered it — the
 * brief never says "make today count."
 */
export function composeDailyBrief(input: DailyBriefInput): DailyBrief {
  const actions: BriefAction[] = [];

  if (input.burnoutRisk) {
    actions.push({
      kind: 'recovery',
      label: 'Open Recovery',
      reason: 'Several signals are pointing the same direction today.',
      href: '/dashboard/recovery',
    });
    actions.push({
      kind: 'walk',
      label: 'Take a 20-minute walk',
      reason: 'The single most useful thing on a day like this.',
      href: '/dashboard/recovery',
    });
    return {
      focusToday: 'Protecting your baseline. Keep today light and finish earlier than usual.',
      avoidToday: 'Hard training, long stretches of deep work, and saying yes to anything new.',
      actions,
    };
  }

  const band = input.readiness === null ? null : readinessBand(input.readiness);

  if (band === 'depleted') {
    actions.push({
      kind: 'recovery',
      label: 'See recovery guidance',
      reason: `Your readiness is ${input.readiness}.`,
      href: '/dashboard/recovery',
    });
    if (input.timeOfDay === 'evening' || input.timeOfDay === 'night') {
      actions.push({
        kind: 'wind-down',
        label: 'Start wind-down',
        reason: 'Getting a full night tonight is what moves this number.',
        href: '/dashboard/sleep',
      });
    }
    return {
      focusToday: 'Low-cost work and an early night. Your body is asking for a lighter day.',
      avoidToday: 'Intense exercise and back-to-back commitments.',
      actions,
    };
  }

  if (input.timeOfDay === 'evening' || input.timeOfDay === 'night') {
    actions.push({
      kind: 'wind-down',
      label: 'Start wind-down',
      reason: 'The last hour before bed is the part that changes tomorrow.',
      href: '/dashboard/sleep',
    });
    return {
      focusToday: 'Closing the day well. Sleep is the highest-leverage thing left on the list.',
      avoidToday: input.energy !== null && input.energy > 60 ? 'Late caffeine — your energy is still high for this hour.' : null,
      actions,
    };
  }

  if (input.focusWindow) {
    actions.push({
      kind: 'focus',
      label: `Focus ${formatWindow(input.focusWindow.start, input.focusWindow.end)}`,
      reason: 'Your longest clear stretch today.',
      href: '/dashboard/focus',
    });
  } else {
    actions.push({
      kind: 'focus',
      label: 'Start a focus session',
      reason: band === 'primed' ? 'Your readiness is high enough for real depth.' : 'A single protected block beats a scattered day.',
      href: '/dashboard/focus',
    });
  }

  const heavyDay = input.bookedHoursToday !== null && input.bookedHoursToday >= 5;
  if (heavyDay) {
    actions.push({
      kind: 'plan',
      label: 'Protect one gap',
      reason: `You have ${Math.round(input.bookedHoursToday!)} hours booked.`,
      href: '/dashboard/energy',
    });
  }

  return {
    focusToday:
      band === 'primed'
        ? 'Your hardest work. Readiness is high — this is the day to spend it on something that matters.'
        : 'One or two things done properly. Steady is the right pace today.',
    avoidToday: heavyDay ? 'Adding anything else to today — the calendar is already full.' : null,
    actions,
  };
}
