import { Card } from "@/components/ui/Card";
import { iconForRuleName, timeAgo } from "@/lib/activityDisplay";
import type { AutomationHistoryEntry } from "@/lib/types";

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
