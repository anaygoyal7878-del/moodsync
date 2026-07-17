import { backendFetch } from "@/lib/api";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import type { InsightsResponse } from "@/lib/types";

export default async function InsightsPage() {
  const insightsResult = await backendFetch<InsightsResponse>("/api/insights?days=14");
  const insights: InsightsResponse = insightsResult.ok
    ? insightsResult.data
    : { trends: [], wellnessTrends: [], automationEffectiveness: [] };

  return (
    <InsightsSection
      trends={insights.trends}
      wellnessTrends={insights.wellnessTrends}
      automationEffectiveness={insights.automationEffectiveness}
    />
  );
}
