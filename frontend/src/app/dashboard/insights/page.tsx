import { backendFetch } from "@/lib/api";
import { LuxuryInsights } from "@/components/luxury/LuxuryInsights";
import type { InsightsResponse, RecommendationEntry } from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

export default async function InsightsPage() {
  const [insightsResult, historyResult, recommendationsResult] = await Promise.all([
    backendFetch<InsightsResponse>("/api/insights?days=14"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
    backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
  ]);

  const insights: InsightsResponse = insightsResult.ok
    ? insightsResult.data
    : { trends: [], wellnessTrends: [], automationEffectiveness: [] };
  const history = historyResult.ok ? historyResult.data.readings : [];
  const recommendations = recommendationsResult.ok ? recommendationsResult.data.recommendations : [];

  return (
    <LuxuryInsights
      history={history}
      wellnessTrends={insights.wellnessTrends}
      trends={insights.trends}
      automationEffectiveness={insights.automationEffectiveness}
      recommendations={recommendations}
    />
  );
}
