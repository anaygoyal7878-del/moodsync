import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { buildHomeInsights } from "@/lib/homeInsights";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { HeartRatePulse } from "@/components/dashboard/HeartRatePulse";
import { WellnessTimeline } from "@/components/dashboard/WellnessTimeline";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Cpu, Zap, Wand2 } from "lucide-react";
import type {
  WellnessResponse,
  InsightsResponse,
  ConnectionsResponse,
  AutomationRuleDefinition,
  RecommendationEntry,
} from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

interface MeResponse {
  displayName: string | null;
  email: string;
}

/** The same per-metric wellness-state color mapping WellnessScoreCard
 * uses (see that file's doc comment) — kept in sync manually since this
 * grid is a different, smaller subset of the same scores, not a shared
 * component. */
const SCORE_MOOD: Record<string, string> = {
  stress: "text-mood-energy",
  recovery: "text-mood-recovery",
  sleep: "text-mood-sleep",
  energy: "text-mood-energy",
  focus: "text-mood-focus",
};

export default async function DashboardHomePage() {
  const [meResult, wellnessResult, insightsResult, latestResult, historyResult, connectionsResult, rulesResult, recommendationsResult] =
    await Promise.all([
      backendFetch<MeResponse>("/api/me"),
      backendFetch<WellnessResponse>("/api/wellness"),
      backendFetch<InsightsResponse>("/api/insights?days=14"),
      backendFetch<{ reading: NormalizedBiometricReading | null }>("/api/biometrics/latest"),
      backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
      backendFetch<ConnectionsResponse>("/api/connections"),
      backendFetch<{ rules: AutomationRuleDefinition[] }>("/api/automation-rules"),
      backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
    ]);

  const name = (meResult.ok ? meResult.data.displayName : null) ?? (meResult.ok ? meResult.data.email.split("@")[0] : "there");
  const scores = wellnessResult.ok ? wellnessResult.data.scores : null;
  const wellnessTrends = insightsResult.ok ? insightsResult.data.wellnessTrends : [];
  const insights = buildHomeInsights(wellnessTrends);
  const latestReading = latestResult.ok ? latestResult.data.reading : null;
  const history = historyResult.ok ? historyResult.data.readings : [];
  const connections: ConnectionsResponse = connectionsResult.ok ? connectionsResult.data : { wearables: [], smartHome: [] };
  const deviceCount = connections.smartHome.flatMap((c) => c.devices).length;
  const rules = rulesResult.ok ? rulesResult.data.rules : [];
  const activeRuleCount = rules.filter((r) => r.enabled).length;
  const topRecommendation = recommendationsResult.ok
    ? recommendationsResult.data.recommendations.find((r) => r.status === "PENDING")
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <WelcomeBanner name={name ?? "there"} insights={insights} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Overall wellness" value={scores?.overall.value ?? null} />
          <MetricTile label="Recovery" value={scores?.recovery.value ?? null} moodClassName={SCORE_MOOD.recovery} />
          <MetricTile label="Stress" value={scores?.stress.value ?? null} moodClassName={SCORE_MOOD.stress} />
          <MetricTile label="Sleep" value={scores?.sleep.value ?? null} moodClassName={SCORE_MOOD.sleep} />
          <MetricTile label="Energy" value={scores?.energy.value ?? null} moodClassName={SCORE_MOOD.energy} />
          <MetricTile label="Focus" value={scores?.focus.value ?? null} moodClassName={SCORE_MOOD.focus} />
          <MetricTile label="Heart rate" value={latestReading?.heartRate ?? null} unit="bpm" />
          <MetricTile
            label="HRV"
            value={latestReading?.heartRateVariability ? Math.round(latestReading.heartRateVariability) : null}
            unit="ms"
          />
        </div>
        <Link href="/dashboard/wellness" className="text-xs text-ink-secondary underline-offset-2 hover:underline">
          See every score and how it&apos;s calculated →
        </Link>
      </section>

      {latestReading?.heartRate !== undefined && <HeartRatePulse latest={latestReading} />}

      <WellnessTimeline history={history} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/dashboard/automation">
          <Card className="flex h-full items-center gap-3 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
              <Zap size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums">{activeRuleCount}</p>
              <p className="text-xs text-ink-secondary">Active automation{activeRuleCount === 1 ? "" : "s"}</p>
            </div>
          </Card>
        </Link>
        <Link href="/dashboard/devices">
          <Card className="flex h-full items-center gap-3 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
              <Cpu size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold tabular-nums">{deviceCount}</p>
              <p className="text-xs text-ink-secondary">Connected device{deviceCount === 1 ? "" : "s"}</p>
            </div>
          </Card>
        </Link>
        <Link href="/dashboard/recommendations">
          <Card className="flex h-full items-start gap-3 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
              <Wand2 size={16} aria-hidden="true" />
            </span>
            <div>
              {topRecommendation ? (
                <>
                  <p className="text-sm font-medium">{topRecommendation.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{topRecommendation.description}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No recommendations right now</p>
                  <Badge variant="neutral" className="mt-1">
                    Check back later
                  </Badge>
                </>
              )}
            </div>
          </Card>
        </Link>
      </section>
    </div>
  );
}
