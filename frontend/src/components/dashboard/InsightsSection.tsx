import { Card } from "@/components/ui/Card";
import { metricLabel } from "@/lib/metrics";
import type { TrendResult, AutomationEffectivenessResult } from "@/lib/types";

const DIRECTION_ARROW: Record<TrendResult["direction"], string> = { up: "↑", down: "↓", flat: "→" };

export function InsightsSection({
  trends,
  automationEffectiveness,
}: {
  trends: TrendResult[];
  automationEffectiveness: AutomationEffectivenessResult[];
}) {
  const hasData = trends.length > 0 || automationEffectiveness.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Wellness trends</h2>

      {!hasData ? (
        <Card className="flex flex-col items-start gap-1.5 py-6">
          <p className="text-sm font-medium text-ink">Not enough data yet</p>
          <p className="text-sm text-ink-secondary">
            Trends appear once you have readings across a few days, and automation effectiveness once a rule has
            fired more than once.
          </p>
        </Card>
      ) : (
        <>
          {trends.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {trends.map((t) => (
                <Card key={t.metric} className="py-4 transition-colors hover:bg-surface-hover">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">{metricLabel(t.metric)}</p>
                  <p className="mt-1 flex items-baseline gap-1.5 text-2xl font-semibold tabular-nums">
                    {t.current}
                    <span
                      className={
                        t.direction === "flat"
                          ? "text-sm font-medium text-ink-muted"
                          : "text-sm font-medium text-ink-secondary"
                      }
                    >
                      {DIRECTION_ARROW[t.direction]} {Math.abs(t.delta)}
                    </span>
                  </p>
                </Card>
              ))}
            </div>
          )}

          {automationEffectiveness.length > 0 && (
            <Card>
              <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Automation effectiveness</p>
              <div className="flex flex-col gap-3">
                {automationEffectiveness.map((a) => (
                  <div key={a.ruleId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">{a.ruleName}</span>
                      <span className="tabular-nums text-ink-muted">
                        {a.effectivenessRate === null
                          ? `${a.executedCount} run${a.executedCount === 1 ? "" : "s"}, not enough data yet`
                          : `${a.effectivenessRate}% improved (${a.improvedCount}/${a.comparableCount})`}
                      </span>
                    </div>
                    {a.effectivenessRate !== null && (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className="h-full rounded-full bg-brand transition-[width]"
                          style={{ width: `${a.effectivenessRate}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Correlation, not proof — whether the metric moved favorably after each automation fired, not a
                controlled experiment.
              </p>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
