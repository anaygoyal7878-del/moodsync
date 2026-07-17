import { backendFetch } from "@/lib/api";
import { WeeklyReportSection } from "@/components/dashboard/WeeklyReportSection";
import type { PersistedInsight } from "@/lib/types";

export default async function WeeklyReportPage() {
  const weeklyInsightsResult = await backendFetch<{ insights: PersistedInsight[] }>(
    "/api/insights/history?period=WEEKLY&limit=50",
  );
  const weeklyInsights = weeklyInsightsResult.ok ? weeklyInsightsResult.data.insights : [];

  return <WeeklyReportSection insights={weeklyInsights} />;
}
