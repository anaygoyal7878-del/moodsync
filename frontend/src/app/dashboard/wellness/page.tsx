import { backendFetch } from "@/lib/api";
import { WellnessScoreCard } from "@/components/dashboard/WellnessScoreCard";
import type { WellnessResponse } from "@/lib/types";

export default async function WellnessPage() {
  const wellnessResult = await backendFetch<WellnessResponse>("/api/wellness");
  const wellnessScores = wellnessResult.ok ? wellnessResult.data.scores : null;

  return <WellnessScoreCard scores={wellnessScores} />;
}
