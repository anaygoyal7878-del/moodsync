import { backendFetch } from "@/lib/api";
import { WellnessScoreCard } from "@/components/dashboard/WellnessScoreCard";
import type { WellnessResponse } from "@/lib/types";

export default async function WellnessPage() {
  const wellnessResult = await backendFetch<WellnessResponse>("/api/wellness");
  const wellnessScores = wellnessResult.ok ? wellnessResult.data.scores : null;

  // The wrapper exists purely as a walkthrough anchor (see
  // components/demo/tour/tourSteps.ts) — it adds no layout of its own.
  return (
    <div data-tour="wellness-detail">
      <WellnessScoreCard scores={wellnessScores} />
    </div>
  );
}
