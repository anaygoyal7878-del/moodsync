import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LuxuryWeekBars } from "@/components/luxury/LuxuryWeekBars";
import { LuxuryActivityRow } from "@/components/luxury/LuxuryActivityRow";
import { iconForRuleName } from "@/lib/activityDisplay";
import { Zap, Cpu, Wand2, TrendingUp, TrendingDown, Sparkle } from "lucide-react";
import type {
  WellnessResponse,
  InsightsResponse,
  ConnectionsResponse,
  AutomationRuleDefinition,
  AutomationHistoryEntry,
  RecommendationEntry,
  MeditationSessionEntry,
} from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

/** A slot LuxuryActivityRow can render regardless of whether it came
 * from an automation execution or a completed meditation session — the
 * two are real, differently-shaped records (AutomationHistoryEntry vs
 * MeditationSessionEntry) merged here purely for display, sorted by
 * when each actually happened. */
interface ActivityItem {
  id: string;
  title: string;
  timestamp: string;
  icon: typeof Sparkle;
}

/** Home page — ported from the Superdesign project's Dashboard draft
 * (project 4f734257-…). Same fetches the classic /dashboard used, just
 * restyled: the hero card shows the real overall wellness score and a
 * real "vs recent average" delta (see lib/homeInsights.ts's phrasing
 * convention) instead of the draft's fabricated "+15% from yesterday";
 * the week bars use real per-day recovery scores instead of an
 * invented "mood" series; the activity feed is the same real automation
 * history RecentActivity.tsx renders on the classic dashboard. */
export default async function DashboardHomePage() {
  const [
    wellnessResult,
    insightsResult,
    historyResult,
    connectionsResult,
    rulesResult,
    recommendationsResult,
    automationHistoryResult,
    pauseResult,
    meditationSessionsResult,
  ] = await Promise.all([
    backendFetch<WellnessResponse>("/api/wellness"),
    backendFetch<InsightsResponse>("/api/insights?days=14"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
    backendFetch<ConnectionsResponse>("/api/connections"),
    backendFetch<{ rules: AutomationRuleDefinition[] }>("/api/automation-rules"),
    backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
    backendFetch<{ entries: AutomationHistoryEntry[] }>("/api/automation-history?limit=10"),
    backendFetch<{ pausedUntil: string | null; isPaused: boolean }>("/api/preferences/automation-pause"),
    backendFetch<{ sessions: MeditationSessionEntry[] }>("/api/meditation-sessions?limit=5"),
  ]);

  const scores = wellnessResult.ok ? wellnessResult.data.scores : null;
  const wellnessTrends = insightsResult.ok ? insightsResult.data.wellnessTrends : [];
  const overallTrend = wellnessTrends.find((t) => t.metric === "overall");
  const history = historyResult.ok ? historyResult.data.readings : [];
  const connections: ConnectionsResponse = connectionsResult.ok ? connectionsResult.data : { wearables: [], smartHome: [] };
  const deviceCount = connections.smartHome.flatMap((c) => c.devices).length;
  const rules = rulesResult.ok ? rulesResult.data.rules : [];
  const activeRuleCount = rules.filter((r) => r.enabled).length;
  const topRecommendation = recommendationsResult.ok
    ? recommendationsResult.data.recommendations.find((r) => r.status === "PENDING")
    : undefined;
  const automationHistory = automationHistoryResult.ok ? automationHistoryResult.data.entries : [];
  const meditationSessions = meditationSessionsResult.ok ? meditationSessionsResult.data.sessions : [];
  const isPaused = pauseResult.ok ? pauseResult.data.isPaused : false;

  const recentActivity: ActivityItem[] = [
    ...automationHistory
      .filter((h) => h.outcome === "EXECUTED" || h.outcome === "QUEUED_FOR_DEVICE")
      .map((h) => ({ id: h.id, title: h.rule.name, timestamp: h.executedAt, icon: iconForRuleName(h.rule.name) })),
    ...meditationSessions.map((s) => ({
      id: s.id,
      title: `${s.durationMinutes} min meditation`,
      timestamp: s.completedAt,
      icon: Sparkle,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      {/* Wellness Hero Card */}
      <section
        className="lux-stagger-1 relative overflow-hidden rounded-[26px] p-6"
        style={{
          background: "linear-gradient(160deg, #241a2c 0%, #1d1622 55%, #171220 100%)",
          border: "1px solid var(--lux-hairline-gold)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div className="relative mb-5 flex items-center justify-between">
          <span className="text-[12px] tracking-wide" style={{ color: "var(--lux-muted)" }}>
            Overall wellness
          </span>
          {overallTrend && overallTrend.direction !== "flat" && (
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: overallTrend.direction === "up" ? "rgba(95,184,120,0.15)" : "rgba(217,168,200,0.15)",
                color: overallTrend.direction === "up" ? "var(--lux-sage)" : "var(--lux-rose)",
              }}
            >
              {overallTrend.direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.round(Math.abs(overallTrend.delta))} pts vs. recent average
            </span>
          )}
        </div>
        <div className="relative flex items-end justify-between pt-1">
          <div className="flex items-baseline gap-1">
            <span className="font-luxury-display tabular text-[42px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {scores?.overall.value ?? "—"}
            </span>
            <span className="tabular text-[16px]" style={{ color: "var(--lux-muted)" }}>
              /100
            </span>
          </div>
          <Link
            href="/dashboard/wellness"
            className="text-[12px] font-medium"
            style={{ color: "var(--lux-sage)" }}
          >
            See breakdown →
          </Link>
        </div>
      </section>

      <div className="lux-stagger-2">
        <QuickActions isPaused={isPaused} luxury />
      </div>

      {/* Wellness Pattern */}
      <section
        className="lux-stagger-3 rounded-[24px] p-5"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
      >
        <h2 className="font-luxury-display text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          Recovery Pattern
        </h2>
        <p className="mb-4 text-[12px]" style={{ color: "var(--lux-muted)" }}>
          Last 7 days
        </p>
        <LuxuryWeekBars history={history} />
      </section>

      {recentActivity.length > 0 && (
        <section className="lux-stagger-4 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-luxury-display text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              Recent Activity
            </h2>
            <Link href="/dashboard/automation" className="text-[13px] font-medium" style={{ color: "var(--lux-sage)" }}>
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {recentActivity.map((item) => (
              <LuxuryActivityRow key={item.id} title={item.title} timestamp={item.timestamp} icon={item.icon} />
            ))}
          </div>
        </section>
      )}

      <section className="lux-stagger-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/dashboard/automation"
          className="flex items-center gap-3 rounded-[20px] p-4"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" }}
          >
            <Zap size={16} aria-hidden="true" />
          </span>
          <div>
            <p className="tabular text-[18px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {activeRuleCount}
            </p>
            <p className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
              Active automation{activeRuleCount === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
        <Link
          href="/dashboard/devices"
          className="flex items-center gap-3 rounded-[20px] p-4"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" }}
          >
            <Cpu size={16} aria-hidden="true" />
          </span>
          <div>
            <p className="tabular text-[18px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {deviceCount}
            </p>
            <p className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
              Connected device{deviceCount === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
        <Link
          href="/dashboard/recommendations"
          className="flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-gold)" }}
          >
            <Wand2 size={16} aria-hidden="true" />
          </span>
          <div>
            {topRecommendation ? (
              <>
                <p className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                  {topRecommendation.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[12px]" style={{ color: "var(--lux-muted)" }}>
                  {topRecommendation.description}
                </p>
              </>
            ) : (
              <p className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                No recommendations right now
              </p>
            )}
          </div>
        </Link>
      </section>
    </div>
  );
}
