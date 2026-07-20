import { backendFetch } from "@/lib/api";
import { RecommendationsSection } from "@/components/dashboard/RecommendationsSection";
import type { RecommendationEntry } from "@/lib/types";

export default async function RecommendationsPage() {
  const recommendationsResult = await backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations");
  const recommendations = recommendationsResult.ok ? recommendationsResult.data.recommendations : [];

  // Wrapper is a walkthrough anchor only — see tourSteps.ts.
  return (
    <div data-tour="recommendations">
      <RecommendationsSection recommendations={recommendations} />
    </div>
  );
}
