/** Cooldown/priority display helpers for RuleForm.tsx — the backend
 * stores both as plain numbers (`AutomationRuleDefinition.cooldownMinutes`
 * / `.priority`, shared/src/automation.ts), these just decide how the
 * builder presents and buckets them so neither ever shows as a bare
 * unlabeled number. */

export const COOLDOWN_PRESETS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "60 min" },
  { minutes: 120, label: "2 hr" },
] as const;

export function formatCooldown(minutes: number): string {
  if (minutes % 60 === 0 && minutes >= 60) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export type PriorityTier = "low" | "normal" | "high" | "critical";

/** Priority is a real 0-100 number used to break ties when two rules
 * target the same resource (shared/src/automation.ts's doc comment on
 * `priority`) — these are just the four named buckets the slider snaps
 * to, matching each tier's midpoint so the underlying number stays
 * meaningful (e.g. "High" -> 75, not an arbitrary round number). */
export const PRIORITY_TIERS: { tier: PriorityTier; label: string; value: number }[] = [
  { tier: "low", label: "Low", value: 25 },
  { tier: "normal", label: "Normal", value: 50 },
  { tier: "high", label: "High", value: 75 },
  { tier: "critical", label: "Critical", value: 100 },
];

export function priorityTierFor(value: number): PriorityTier {
  if (value <= 25) return "low";
  if (value <= 50) return "normal";
  if (value <= 75) return "high";
  return "critical";
}

export function formatPriority(value: number): string {
  const tier = PRIORITY_TIERS.find((t) => t.tier === priorityTierFor(value))!;
  return `${tier.label} (${value})`;
}
