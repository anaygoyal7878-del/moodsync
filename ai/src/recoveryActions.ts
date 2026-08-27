/**
 * Recovery actions — which recovery move to suggest *this* person right
 * now, and why.
 *
 * The four underlying actions (walk, breathe, hydrate, stop earlier) are
 * fixed and deliberately unglamorous: they're the ones with a real
 * evidence base and no equipment. What adapts is which of them surface,
 * in what order, and what reason each one carries.
 *
 * Two things drive that, in priority order:
 *
 *   1. **This user's own measured history.** If Wellness Memory has seen
 *      meditation move their recovery +6 over 5 sessions, breathing
 *      leads and says so with the real number. That beats any heuristic,
 *      because it's the only input that's actually about them.
 *   2. **Their signals right now** — stress, resting heart rate against
 *      baseline, steps so far today, and the local hour.
 *
 * Actions whose moment has passed are dropped, not reordered: "end work
 * earlier" at 11pm is noise, and a list that always shows all four in
 * the same order is a listicle, not a recommendation. Every action
 * states the specific reason it appeared, and `personalized` marks the
 * ones grounded in the user's own before/after history rather than a
 * heuristic — the UI must never present the two as equally proven.
 */

export type RecoveryActionKind = 'walk' | 'breathing' | 'hydrate' | 'stop_early';

export interface RecoveryAction {
  kind: RecoveryActionKind;
  label: string;
  /** Why this action, for this person, right now. Never generic. */
  reason: string;
  /** True only when `reason` comes from this user's own measured
   * before/after history. The UI badges these differently — a heuristic
   * must never be dressed up as a proven personal finding. */
  personalized: boolean;
  href?: string;
}

export interface RecoveryActionInput {
  /** 0-100. Null when there's no wearable basis for one. */
  recoveryScore: number | null;
  /** 0-100, higher = more stressed. */
  stressScore: number | null;
  /** 0-100. */
  sleepScore: number | null;
  /** Today's resting heart rate minus the trailing baseline, in bpm.
   * Positive means elevated. Null when either side is missing. */
  restingHeartRateDelta: number | null;
  /** Steps recorded so far today. */
  stepsToday: number | null;
  /** Local hour, 0-23, in the user's own timezone. */
  hourOfDay: number;
  /** Wellness Memory findings — mean recovery delta per action label
   * over this user's own history. Only labels this module recognizes
   * are used; anything else is ignored rather than guessed at. */
  memory: Array<{ label: string; meanDelta: number; sampleSize: number }>;
}

/** Wellness Memory labels that correspond to a recovery action here.
 * Matched case-insensitively against the finding's label. A scene or
 * playlist name that happens to help is real, but it isn't one of these
 * four actions, so it's left to the "What works for you" list instead of
 * being forced into this one. */
const MEMORY_LABEL_TO_KIND: Array<{ pattern: RegExp; kind: RecoveryActionKind }> = [
  { pattern: /meditation/i, kind: 'breathing' },
  { pattern: /breath/i, kind: 'breathing' },
  { pattern: /walk/i, kind: 'walk' },
];

/** Below this, Wellness Memory itself won't report a finding — mirrored
 * here so a personalized reason can never cite fewer sessions than the
 * memory layer is willing to stand behind. */
const MIN_MEMORY_SAMPLE = 3;
/** A memory finding has to show a real gain, not noise, before it earns
 * the top slot and a "+N recovery" claim. */
const MIN_MEANINGFUL_DELTA = 2;

const HIGH_STRESS = 60;
const LOW_RECOVERY = 50;
const LOW_SLEEP = 60;
/** Resting heart rate this far above baseline is the classic
 * under-recovered / under-hydrated signal. */
const ELEVATED_RHR_DELTA = 3;
/** Below this by mid-afternoon, the day has been sedentary. */
const LOW_STEPS = 4000;

/** Hours during which each action is worth suggesting at all. A walk at
 * 2am and "end work earlier" at 11pm are both past their moment. */
const ACTIVE_HOURS: Record<RecoveryActionKind, { from: number; to: number }> = {
  walk: { from: 7, to: 19 },
  stop_early: { from: 12, to: 20 },
  // Always reasonable.
  breathing: { from: 0, to: 23 },
  hydrate: { from: 0, to: 23 },
};

interface Candidate extends RecoveryAction {
  score: number;
}

function inActiveHours(kind: RecoveryActionKind, hourOfDay: number): boolean {
  const window = ACTIVE_HOURS[kind];
  return hourOfDay >= window.from && hourOfDay <= window.to;
}

/** The strongest recognized memory finding per action kind. */
function memoryFor(
  input: RecoveryActionInput,
  kind: RecoveryActionKind,
): { meanDelta: number; sampleSize: number } | null {
  const matches = input.memory.filter((finding) => {
    const mapped = MEMORY_LABEL_TO_KIND.find((entry) => entry.pattern.test(finding.label));
    return mapped?.kind === kind && finding.sampleSize >= MIN_MEMORY_SAMPLE && finding.meanDelta >= MIN_MEANINGFUL_DELTA;
  });
  if (matches.length === 0) return null;
  return matches.reduce((best, f) => (f.meanDelta > best.meanDelta ? f : best));
}

function sessionWord(count: number): string {
  return count === 1 ? 'session' : 'sessions';
}

/**
 * Ranks the recovery actions worth showing right now, strongest first.
 *
 * Returns at most `limit` (default 3) — a recovery page that lists every
 * option it can think of has made no recommendation at all. Returns an
 * empty array only if every action is out of its active hours, which
 * can't happen with the current windows (breathing and hydrate are
 * always in range); the caller should still handle it rather than
 * assume.
 */
export function rankRecoveryActions(input: RecoveryActionInput, limit = 3): RecoveryAction[] {
  const candidates: Candidate[] = [];

  const push = (candidate: Candidate) => {
    if (inActiveHours(candidate.kind, input.hourOfDay)) candidates.push(candidate);
  };

  // --- Walk -------------------------------------------------------
  const walkMemory = memoryFor(input, 'walk');
  const sedentary = input.stepsToday !== null && input.stepsToday < LOW_STEPS && input.hourOfDay >= 14;
  push({
    kind: 'walk',
    label: 'A 20-minute walk',
    personalized: walkMemory !== null,
    reason: walkMemory
      ? `Walking has moved your recovery +${walkMemory.meanDelta} on average across ${walkMemory.sampleSize} ${sessionWord(walkMemory.sampleSize)}.`
      : sedentary
        ? `You're at ${input.stepsToday!.toLocaleString()} steps so far today — low-intensity movement is the most reliable thing on this list.`
        : 'Low-intensity movement, outside if you can. The most reliable thing on this list.',
    score: (walkMemory ? 100 + walkMemory.meanDelta : 0) + (sedentary ? 40 : 0) + 10,
  });

  // --- Breathing --------------------------------------------------
  const breathMemory = memoryFor(input, 'breathing');
  const stressed = input.stressScore !== null && input.stressScore >= HIGH_STRESS;
  push({
    kind: 'breathing',
    label: 'Five minutes of slow breathing',
    href: '/dashboard/meditation',
    personalized: breathMemory !== null,
    reason: breathMemory
      ? `Your own history: this has moved your recovery +${breathMemory.meanDelta} across ${breathMemory.sampleSize} ${sessionWord(breathMemory.sampleSize)}.`
      : stressed
        ? `Your stress reading is ${input.stressScore}, which is elevated for you. Longer exhale than inhale.`
        : 'Longer exhale than inhale. Works in a chair, anywhere.',
    score: (breathMemory ? 100 + breathMemory.meanDelta : 0) + (stressed ? 45 : 0) + 8,
  });

  // --- Hydrate ----------------------------------------------------
  const elevatedRHR = input.restingHeartRateDelta !== null && input.restingHeartRateDelta >= ELEVATED_RHR_DELTA;
  push({
    kind: 'hydrate',
    label: 'Hydrate',
    personalized: false,
    reason: elevatedRHR
      ? `Your resting heart rate is ${Math.round(input.restingHeartRateDelta!)} bpm above your baseline — dehydration shows up there before it shows up as thirst.`
      : 'Dehydration shows up as elevated resting heart rate before it shows up as thirst.',
    score: (elevatedRHR ? 50 : 0) + 6,
  });

  // --- End work earlier -------------------------------------------
  const poorSleep = input.sleepScore !== null && input.sleepScore < LOW_SLEEP;
  const lowRecovery = input.recoveryScore !== null && input.recoveryScore < LOW_RECOVERY;
  push({
    kind: 'stop_early',
    label: 'End work earlier',
    personalized: false,
    reason: poorSleep
      ? `You slept at ${input.sleepScore}. Finishing earlier tonight is the cheapest way to not repeat it.`
      : lowRecovery
        ? `Recovery is ${input.recoveryScore} — your body is asking for a shorter day, not a harder one.`
        : 'The cheapest recovery intervention there is, and the one most often skipped.',
    score: (poorSleep ? 45 : 0) + (lowRecovery ? 35 : 0) + 4,
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...action }) => action);
}
