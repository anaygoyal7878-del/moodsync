import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { backendFetch } from "@/lib/api";
import { LogoutButton } from "@/components/marketing/LogoutButton";
import { ConnectErrorBanner } from "@/components/dashboard/ConnectErrorBanner";
import { ConnectionsSection } from "@/components/dashboard/ConnectionsSection";
import { DevicesSection } from "@/components/dashboard/DevicesSection";
import { BiometricsSection } from "@/components/dashboard/BiometricsSection";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { AutomationSection } from "@/components/dashboard/AutomationSection";
import { WellnessScoreCard } from "@/components/dashboard/WellnessScoreCard";
import { NotificationHistorySection } from "@/components/dashboard/NotificationHistorySection";
import { WeeklyReportSection } from "@/components/dashboard/WeeklyReportSection";
import { RecommendationsSection } from "@/components/dashboard/RecommendationsSection";
import { TimezoneSync } from "@/components/dashboard/TimezoneSync";
import { DashboardDock } from "@/components/dashboard/DashboardDock";
import type {
  ConnectionsResponse,
  AutomationRuleDefinition,
  AutomationHistoryEntry,
  InsightsResponse,
  WellnessResponse,
  NotificationEntry,
  NotificationPreferences,
  PersistedInsight,
  RecommendationEntry,
} from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

async function fetchCurrentUser(): Promise<MeResponse | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const response = await fetch(`${BACKEND_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, { error }] = await Promise.all([fetchCurrentUser(), searchParams]);
  if (!user) redirect("/login");

  const [
    connectionsResult,
    latestResult,
    historyResult,
    rulesResult,
    automationHistoryResult,
    insightsResult,
    wellnessResult,
    notificationsResult,
    pauseResult,
    notificationPreferencesResult,
    weeklyInsightsResult,
    recommendationsResult,
  ] = await Promise.all([
    backendFetch<ConnectionsResponse>("/api/connections"),
    backendFetch<{ reading: NormalizedBiometricReading | null }>("/api/biometrics/latest"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
    backendFetch<{ rules: AutomationRuleDefinition[] }>("/api/automation-rules"),
    backendFetch<{ entries: AutomationHistoryEntry[] }>("/api/automation-history?limit=20"),
    backendFetch<InsightsResponse>("/api/insights?days=14"),
    backendFetch<WellnessResponse>("/api/wellness"),
    backendFetch<{ notifications: NotificationEntry[] }>("/api/notifications?limit=20"),
    backendFetch<{ pausedUntil: string | null; isPaused: boolean }>("/api/preferences/automation-pause"),
    backendFetch<NotificationPreferences>("/api/preferences/notifications"),
    backendFetch<{ insights: PersistedInsight[] }>("/api/insights/history?period=WEEKLY&limit=50"),
    backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
  ]);

  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [] };
  const latest = latestResult.ok ? latestResult.data.reading : null;
  const history = historyResult.ok ? historyResult.data.readings : [];
  const rules = rulesResult.ok ? rulesResult.data.rules : [];
  const automationHistory = automationHistoryResult.ok ? automationHistoryResult.data.entries : [];
  const insights: InsightsResponse = insightsResult.ok
    ? insightsResult.data
    : { trends: [], wellnessTrends: [], automationEffectiveness: [] };
  const wellnessScores = wellnessResult.ok ? wellnessResult.data.scores : null;
  const notifications = notificationsResult.ok ? notificationsResult.data.notifications : [];
  const pausedUntil = pauseResult.ok ? pauseResult.data.pausedUntil : null;
  const isAutomationPaused = pauseResult.ok ? pauseResult.data.isPaused : false;
  const notificationPreferences: NotificationPreferences = notificationPreferencesResult.ok
    ? notificationPreferencesResult.data
    : { notificationsEnabled: true, quietHoursStart: null, quietHoursEnd: null };
  const weeklyInsights = weeklyInsightsResult.ok ? weeklyInsightsResult.data.insights : [];
  const recommendations = recommendationsResult.ok ? recommendationsResult.data.recommendations : [];
  const devices = connections.smartHome.flatMap((c) => c.devices);
  const spotifyConnected = connections.smartHome.some((c) => c.provider === "SPOTIFY" && c.status === "ACTIVE");

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-10 px-6 py-12 pb-28 sm:py-16 sm:pb-28">
      <TimezoneSync serverTimezone={user.timezone} />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-ink-secondary sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      {error && <ConnectErrorBanner error={error} />}

      <div id="connections">
        <ConnectionsSection connections={connections} />
      </div>
      <div id="biometrics">
        <BiometricsSection latest={latest} history={history} />
      </div>
      <div id="wellness">
        <WellnessScoreCard scores={wellnessScores} />
      </div>
      <RecommendationsSection recommendations={recommendations} />
      <InsightsSection
        trends={insights.trends}
        wellnessTrends={insights.wellnessTrends}
        automationEffectiveness={insights.automationEffectiveness}
      />
      <DevicesSection devices={devices} />
      <WeeklyReportSection insights={weeklyInsights} />
      <div id="automation-rules">
        <AutomationSection rules={rules} history={automationHistory} devices={devices} spotifyConnected={spotifyConnected} />
      </div>
      <div id="notifications">
        <NotificationHistorySection
          notifications={notifications}
          pausedUntil={pausedUntil}
          isPaused={isAutomationPaused}
          preferences={notificationPreferences}
        />
      </div>

      <DashboardDock />
    </div>
  );
}
