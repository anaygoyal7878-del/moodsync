import { Wind, Brain, Sunrise, Moon, Dumbbell, HeartPulse, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { AutomationHistoryEntry } from "@/lib/types";

/** Purely decorative — matches a rule's real name against the same kind
 * of keywords the Alexa skill uses to find a rule for a named voice
 * command (see integrations/alexa/src/intents.ts's
 * NAMED_RULE_INTENT_KEYWORDS), not a claim about the rule's actual
 * content. A rule named anything else just gets the generic icon. */
const KEYWORD_ICONS: Array<{ keywords: string[]; icon: typeof Wind }> = [
  { keywords: ["relax", "calm", "stress"], icon: Wind },
  { keywords: ["focus"], icon: Brain },
  { keywords: ["sleep", "bed", "night"], icon: Moon },
  { keywords: ["morning", "wake", "sunrise"], icon: Sunrise },
  { keywords: ["workout", "exercise"], icon: Dumbbell },
  { keywords: ["recovery"], icon: HeartPulse },
];

function iconForRuleName(name: string): typeof Wind {
  const lower = name.toLowerCase();
  return KEYWORD_ICONS.find((entry) => entry.keywords.some((k) => lower.includes(k)))?.icon ?? Zap;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Real automation-history entries, most recent first — "Recently Used"
 * built from actual dispatch outcomes (ai/src/dispatch.ts's
 * AutomationExecutionLog), not fabricated scene-usage stats. Only
 * EXECUTED and QUEUED_FOR_DEVICE are shown here — a skip/failure isn't
 * "recently used," it's the opposite. */
export function RecentActivity({ history }: { history: AutomationHistoryEntry[] }) {
  const recent = history.filter((h) => h.outcome === "EXECUTED" || h.outcome === "QUEUED_FOR_DEVICE").slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Recent activity</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recent.map((entry) => {
          const Icon = iconForRuleName(entry.rule.name);
          return (
            <Card key={entry.id} className="flex w-44 shrink-0 flex-col gap-2 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-brand">
                <Icon size={15} aria-hidden="true" />
              </span>
              <div>
                <p className="truncate text-sm font-medium">{entry.rule.name}</p>
                <p className="text-xs text-ink-muted">{timeAgo(entry.executedAt)}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
