import type { TrendResult } from "@/lib/types";
import { metricLabel } from "@/lib/metrics";

/** Turns real `wellnessTrends` (ai/src/insights.ts's before/after score
 * comparison — never invented) into the plain-language sentences shown
 * under the dashboard home's greeting. `delta` is an absolute score-point
 * difference (both values are already 0-100 scores), not a percentage —
 * phrased that way deliberately so this never claims a "%" figure the
 * underlying data doesn't actually compute. Picks the 3 most notable
 * (largest absolute change) rather than every metric, since a "glanceable"
 * summary shouldn't list all 8. */
export function buildHomeInsights(wellnessTrends: TrendResult[]): string[] {
  const notable = [...wellnessTrends]
    .filter((t) => t.direction !== "flat")
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return notable.map((t) => {
    const label = metricLabel(t.metric);
    const verb = t.direction === "up" ? "up" : "down";
    // Rounded to a whole point for the sentence — `delta` itself is
    // ai/src/insights.ts's real round-to-2-decimals value; a fractional
    // "point" just reads oddly in prose, this doesn't change the
    // underlying figure shown elsewhere (e.g. InsightsSection's trend
    // cards, which do show the precise delta).
    const points = Math.round(Math.abs(t.delta));
    if (points === 0) return null;
    return `${label} is ${verb} ${points} point${points === 1 ? "" : "s"} vs. your recent average.`;
  }).filter((line): line is string => line !== null);
}
