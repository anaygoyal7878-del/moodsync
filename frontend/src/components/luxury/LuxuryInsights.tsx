import Link from "next/link";
import { Brain } from "lucide-react";
import { LuxuryGauge } from "@/components/luxury/LuxuryGauge";
import { LuxuryWeekBars } from "@/components/luxury/LuxuryWeekBars";
import { metricLabel } from "@/lib/metrics";
import type { TrendResult, AutomationEffectivenessResult, RecommendationEntry } from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

const DIRECTION_LABEL: Record<TrendResult["direction"], string> = { up: "Rising", down: "Falling", flat: "Steady" };
const DIRECTION_ARROW: Record<TrendResult["direction"], string> = { up: "↑", down: "↓", flat: "→" };

function findTrend(trends: TrendResult[], metric: string): TrendResult | undefined {
  return trends.find((t) => t.metric === metric);
}

/** Ported from the Superdesign Weekly Insights draft. Every card maps to
 * real data already computed elsewhere in the app — see each section's
 * comment for its source — and two of the draft's sections (Top Mood
 * Triggers, Your Habits progress bars) are dropped entirely rather than
 * faked: no trigger-correlation or habit-tracking feature exists
 * anywhere in this codebase to back them. */
export function LuxuryInsights({
  history,
  wellnessTrends,
  trends,
  automationEffectiveness,
  recommendations,
}: {
  history: NormalizedBiometricReading[];
  wellnessTrends: TrendResult[];
  trends: TrendResult[];
  automationEffectiveness: AutomationEffectivenessResult[];
  recommendations: RecommendationEntry[];
}) {
  const overall = findTrend(wellnessTrends, "overall");
  const stress = findTrend(wellnessTrends, "stress");
  const recovery = findTrend(wellnessTrends, "recovery");
  const pendingRecommendations = recommendations.filter((r) => r.status === "PENDING");

  return (
    <div className="flex flex-col gap-5">
      {/* Weekly overview — real overall score + real recovery-score bars,
       * same source LuxuryWeekBars already documents on the Home page. */}
      <section
        className="lux-stagger-1 rounded-[24px] p-6"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex flex-col">
            <span className="mb-1 text-[12px] tracking-wide" style={{ color: "var(--lux-muted)" }}>
              Overall wellness
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-luxury-display tabular text-[32px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                {overall?.current ?? "—"}
              </span>
              <span className="text-[16px]" style={{ color: "var(--lux-muted)" }}>
                /100
              </span>
            </div>
          </div>
          {overall && overall.direction !== "flat" && (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: overall.direction === "up" ? "rgba(95,184,120,0.12)" : "rgba(217,168,200,0.12)",
                color: overall.direction === "up" ? "var(--lux-sage)" : "var(--lux-rose)",
              }}
            >
              {DIRECTION_ARROW[overall.direction]} {Math.round(Math.abs(overall.delta))} pts
            </span>
          )}
        </div>
        <LuxuryWeekBars history={history} />
      </section>

      {/* Stress / Recovery gauges — real wellness-score current values. */}
      <section className="lux-stagger-2 flex gap-4">
        <LuxuryGauge
          value={stress?.current ?? null}
          label="Stress"
          color="#ff916e"
          statusLabel={stress ? DIRECTION_LABEL[stress.direction] : "No trend yet"}
        />
        <LuxuryGauge
          value={recovery?.current ?? null}
          label="Recovery"
          color="var(--lux-sage)"
          statusLabel={recovery ? DIRECTION_LABEL[recovery.direction] : "No trend yet"}
        />
      </section>

      {/* AI Insights — real, backend-generated recommendations
       * (ai/src/recommendations.ts), the honest substitute for the
       * draft's unverified "cortisol levels stabilize faster" claim. */}
      {pendingRecommendations.length > 0 && (
        <section className="lux-stagger-3 flex flex-col gap-3">
          <h2 className="font-luxury-display px-1 text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            AI Insights
          </h2>
          <div className="flex flex-col gap-3">
            {pendingRecommendations.map((rec) => (
              <Link
                key={rec.id}
                href="/dashboard/recommendations"
                className="flex gap-4 rounded-2xl p-4"
                style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--lux-bg-card-2)" }}
                >
                  <Brain size={18} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className="mb-1 text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                    {rec.title}
                  </h3>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    {rec.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Automation effectiveness — same real data InsightsSection.tsx
       * shows on the classic dashboard, restyled. */}
      {automationEffectiveness.length > 0 && (
        <section
          className="lux-stagger-4 rounded-[24px] p-5"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <h2 className="font-luxury-display mb-4 text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            Automation Effectiveness
          </h2>
          <div className="flex flex-col gap-3">
            {automationEffectiveness.map((a) => (
              <div key={a.ruleId} className="flex items-center justify-between text-[13px]">
                <span style={{ color: "var(--lux-muted)" }}>{a.ruleName}</span>
                <span className="tabular font-medium" style={{ color: "var(--lux-ink)" }}>
                  {a.effectivenessRate === null
                    ? `${a.executedCount} run${a.executedCount === 1 ? "" : "s"}`
                    : `${a.effectivenessRate}% improved`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raw wellness-score / biometric trend grid — same TrendResult
       * data InsightsSection.tsx's TrendGrid renders, restyled as
       * compact cards. */}
      {trends.length > 0 && (
        <section className="lux-stagger-5 flex flex-col gap-3">
          <h2 className="font-luxury-display px-1 text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            Biometric Trends
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {trends.map((t) => (
              <div
                key={t.metric}
                className="rounded-2xl p-4"
                style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
              >
                <p className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--lux-muted)" }}>
                  {metricLabel(t.metric)}
                </p>
                <p className="tabular flex items-baseline gap-1.5 text-[20px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                  {t.current}
                  <span className="text-[12px] font-medium" style={{ color: "var(--lux-muted)" }}>
                    {DIRECTION_ARROW[t.direction]} {Math.abs(t.delta)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
