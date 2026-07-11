/**
 * Pure so it's unit-testable without a database — the orchestration layer
 * (dispatch.ts) is the only caller that knows how to fetch `lastExecutedAt`.
 */
export function isWithinCooldown(lastExecutedAt: Date | null, cooldownMinutes: number, now: Date = new Date()): boolean {
  if (!lastExecutedAt || cooldownMinutes <= 0) return false;
  const elapsedMinutes = (now.getTime() - lastExecutedAt.getTime()) / 60_000;
  return elapsedMinutes < cooldownMinutes;
}
