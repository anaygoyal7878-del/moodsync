import { backendFetch } from "@/lib/api";
import { RecommendationsSection } from "@/components/dashboard/RecommendationsSection";
import type { RecommendationEntry } from "@/lib/types";

export default async function RecommendationsPage() {
  const recommendationsResult = await backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations");
  const recommendations = recommendationsResult.ok ? recommendationsResult.data.recommendations : [];

  return <RecommendationsSection recommendations={recommendations} />;
}
