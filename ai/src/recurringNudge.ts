/**
 * Plain time-interval nudges — move, hydrate, sit up straight.
 *
 * Every other proactive message in this product only fires when a real
 * biometric or context signal crosses a threshold (see
 * `proactiveNotifications.ts`). This is deliberately not that. It's
 * Poke's "remind me to drink water every two hours" pattern: no signal
 * required, just elapsed time. That's a genuinely different kind of
 * claim — "it's been a while" instead of "something in your data
 * changed" — so it gets its own module rather than being squeezed into
 * the threshold-checker shape.
 *
 * It still answers to the same policy everything else does:
 * `sendProactiveInsight` tags a recurring nudge `intent: 'proactive'`
 * like any other unprompted text, so `dailyProactiveLimit`, quiet
 * hours, and `proactiveEnabled` all still apply. There is exactly one
 * policy for "may MoodSync text first," not a second one for nudges.
 */

export type NudgeKind = 'hydration' | 'movement' | 'posture';

/** Fixed rotation order, not random. A random pick is untestable and
 * would let the same nudge repeat back-to-back by chance — a fixed
 * cycle guarantees variety and makes `nextNudgeKind` a pure function of
 * "what went last," nothing else. */
const ROTATION: readonly NudgeKind[] = ['hydration', 'movement', 'posture'];

export const NUDGE_CONTENT: Record<NudgeKind, { title: string; body: string }> = {
  hydration: {
    title: 'Quick check — had any water recently?',
    body: 'Just a nudge, no pressure. A glass of water now is an easy win.',
  },
  movement: {
    title: 'Stretch break?',
    body: "You've probably been sitting a while. A couple of minutes on your feet is enough.",
  },
  posture: {
    title: 'Posture check',
    body: 'Shoulders down, screen at eye level — a small reset if you’ve been hunched over something.',
  },
};

/**
 * The next kind in the rotation. `null` (nothing sent yet) starts the
 * cycle at its first entry, so a brand-new subscriber's first nudge is
 * deterministic too, not "whatever happens to be first alphabetically."
 * An unrecognized stored kind (a future rotation change, a hand-edited
 * row) is treated the same as `null` rather than throwing — the
 * failure mode of a corrupted rotation state is "restart the cycle,"
 * never a crash.
 */
export function nextNudgeKind(lastKind: NudgeKind | null): NudgeKind {
  if (lastKind === null) return ROTATION[0]!;
  const index = ROTATION.indexOf(lastKind);
  if (index === -1) return ROTATION[0]!;
  return ROTATION[(index + 1) % ROTATION.length]!;
}

/**
 * Has enough time passed since the last recurring nudge?
 *
 * `lastSentAt === null` (never sent one) is always due — someone who
 * just turned this on shouldn't wait a full interval for their first
 * nudge, the same way a new subscription doesn't make you wait for the
 * first issue.
 */
export function isRecurringNudgeDue(intervalHours: number, lastSentAt: Date | null, now: Date): boolean {
  if (lastSentAt === null) return true;
  const elapsedHours = (now.getTime() - lastSentAt.getTime()) / (60 * 60_000);
  return elapsedHours >= intervalHours;
}
