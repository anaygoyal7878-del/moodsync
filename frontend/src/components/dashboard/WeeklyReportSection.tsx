import { Card } from "@/components/ui/Card";
import { metricLabel } from "@/lib/metrics";
import type { PersistedInsight } from "@/lib/types";

/** Persisted insights (workers/src/weeklyReportWorker.ts) use a
 * "wellness."-prefixed metric key to disambiguate a computed score
 * (e.g. "wellness.stress") from the raw biometric field of a similar
 * name (e.g. "stressLevel") — strip it before reusing the same label
 * map InsightsSection already uses for the live on-the-fly view. */
function displayLabel(metric: string): string {
  return metricLabel(metric.startsWith("wellness.") ? metric.slice("wellness.".length) : metric);
}

export function WeeklyReportSection({ insights }: { insights: PersistedInsight[] }) {
  if (insights.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Weekly report</h2>
        <Card>
          <p className="text-sm text-ink-secondary">
            No weekly report yet — this fills in automatically once the weekly report job has run for your account.
          </p>
        </Card>
      </section>
    );
  }

  const [latest] = insights;
  const latestBatch = insights.filter((i) => i.periodStart === latest.periodStart);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Weekly report</h2>
        <span className="text-xs text-ink-muted">
          {new Date(latest.periodStart).toLocaleDateString()} – {new Date(latest.periodEnd).toLocaleDateString()}
        </span>
      </div>
      <Card>
        <div className="flex flex-col gap-3">
          {latestBatch.map((insight) => (
            <div key={insight.id} className="flex flex-col gap-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-ink">{displayLabel(insight.metric)}</p>
              <p className="text-sm text-ink-secondary">{insight.summary}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
