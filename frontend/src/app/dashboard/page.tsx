import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { BiometricsSection } from "@/components/dashboard/BiometricsSection";
import { LuxuryActivityRow } from "@/components/luxury/LuxuryActivityRow";
import { StudyPlannerCard } from "@/components/luxury/StudyPlannerCard";
import { DailyBriefHero, OvernightChanges, BriefGuidance, ScoreStrip } from "@/components/companion/DailyBriefHero";
import { iconForRuleName } from "@/lib/activityDisplay";
import { AlertTriangle, Sparkle, Wand2 } from "lucide-react";
import type {
  DailyBriefResponse,
  AutomationHistoryEntry,
  RecommendationEntry,
  MeditationSessionEntry,
  FocusSessionEntry,
} from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

/** A slot LuxuryActivityRow can render regardless of which real record
 * it came from — automation executions, meditation sessions and focus
 * sessions are three differently-shaped rows merged here purely for
 * display, sorted by when each actually happened. */
interface ActivityItem {
  id: string;
  title: string;
  timestamp: string;
  icon: typeof Sparkle;
}

/**
 * Today — the Daily Brief.
 *
 * This page answers, in order: who are you and what day is it, how ready
 * are you, what changed while you slept, what is today for, what is it
 * not for, and what should you do about it. Everything below that
 * (recovery pattern, recent activity) is context, not the point.
 *
 * The brief itself is computed server-side in one call
 * (`GET /api/daily-brief`) rather than assembled from six client fetches
 * — the home screen of a daily-use app should not be a loading waterfall.
 *
 * Deliberately removed in the companion redesign: the automation-count,
 * device-count and recommendation tiles that used to close this page.
 * Those are console readouts, and console work belongs in the web app's
 * Environment section — a phone at 7am does not need to know how many
 * automation rules are enabled.
 */
export default async function DashboardHomePage() {
  const [
    briefResult,
    historyResult,
    latestResult,
    automationHistoryResult,
    pauseResult,
    meditationSessionsResult,
    focusSessionsResult,
    recommendationsResult,
  ] = await Promise.all([
    backendFetch<DailyBriefResponse>("/api/daily-brief"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
    backendFetch<{ reading: NormalizedBiometricReading | null }>("/api/biometrics/latest"),
    backendFetch<{ entries: AutomationHistoryEntry[] }>("/api/automation-history?limit=10"),
    backendFetch<{ pausedUntil: string | null; isPaused: boolean }>("/api/preferences/automation-pause"),
    backendFetch<{ sessions: MeditationSessionEntry[] }>("/api/meditation-sessions?limit=5"),
    backendFetch<{ sessions: FocusSessionEntry[] }>("/api/focus-sessions?limit=5"),
    backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
  ]);

  const brief: DailyBriefResponse = briefResult.ok
    ? briefResult.data
    : {
        greeting: "Welcome back",
        timeOfDay: "morning",
        hasData: false,
        readiness: { value: null, basis: "heuristic" },
        energy: null,
        overnightChanges: [],
        brief: null,
      };

  const history = historyResult.ok ? historyResult.data.readings : [];
  const latestReading = latestResult.ok ? latestResult.data.reading : null;
  const automationHistory = automationHistoryResult.ok ? automationHistoryResult.data.entries : [];
  const meditationSessions = meditationSessionsResult.ok ? meditationSessionsResult.data.sessions : [];
  const focusSessions = focusSessionsResult.ok ? focusSessionsResult.data.sessions : [];
  const isPaused = pauseResult.ok ? pauseResult.data.isPaused : false;
  const topRecommendation = recommendationsResult.ok
    ? recommendationsResult.data.recommendations.find((r) => r.status === "PENDING")
    : undefined;

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
    ...focusSessions.map((s) => ({
      id: s.id,
      title: `${s.durationMinutes} min focus session`,
      timestamp: s.completedAt,
      icon: Sparkle,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      {/* Burnout is the one thing allowed above the greeting — if it's
          firing, it outranks everything else on the screen. */}
      {brief.burnout && (
        <section
          className="lux-stagger-1 flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "rgba(217,168,200,0.12)", border: "1px solid var(--lux-rose)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--lux-rose)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {brief.burnout.title}
            </p>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--lux-muted)" }}>
              {brief.burnout.body}
            </p>
          </div>
        </section>
      )}

      <DailyBriefHero brief={brief} />

      {brief.hasData && <ScoreStrip brief={brief} />}

      <BriefGuidance brief={brief} />

      <OvernightChanges brief={brief} />

      <StudyPlannerCard />

      <div className="lux-stagger-4">
        <QuickActions isPaused={isPaused} luxury />
      </div>

      {/* The full Health view — score rings and per-metric colored
          charts, moved here from its old /dashboard/biometrics route so
          the day's body signals live on the same screen as the brief.
          Keeps the old "Recovery pattern" section's tour anchor: the
          tour step about trends now spotlights these charts. */}
      <section data-tour="recovery-pattern" className="lux-stagger-4">
        <BiometricsSection latest={latestReading} history={history} embedded />
      </section>

      {topRecommendation && (
        <Link
          href="/dashboard/recommendations"
          className="lux-stagger-5 flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-gold)" }}
          >
            <Wand2 size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
              {topRecommendation.title}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[12px]" style={{ color: "var(--lux-muted)" }}>
              {topRecommendation.description}
            </span>
          </span>
        </Link>
      )}

      {recentActivity.length > 0 && (
        <section data-tour="activity" className="lux-stagger-5 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              Recent activity
            </h2>
            <Link href="/dashboard/insights" className="text-[13px] font-medium" style={{ color: "var(--lux-sage)" }}>
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
    </div>
  );
}
