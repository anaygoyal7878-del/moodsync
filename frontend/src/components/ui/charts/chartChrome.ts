import type { CSSProperties } from "react";

/**
 * The one set of recharts chrome styles every health chart shares —
 * axis ticks, tooltip surface, grid hairlines. Recharts renders its own
 * SVG/portal DOM outside Tailwind's reach, so these have to be inline
 * style objects; centralizing them here is what keeps five charts
 * looking like one system instead of five near-copies drifting apart.
 */

export const AXIS_TICK = { fill: "var(--lux-muted)", fontSize: 11 } as const;

export const GRID_STROKE = "var(--lux-hairline)";

export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "var(--lux-bg-card-2)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius-md)",
  fontSize: "0.75rem",
  color: "var(--lux-ink)",
  boxShadow: "var(--shadow-md)",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: "var(--lux-muted)" };

/** Crosshair line under the hover point on line/area charts. */
export const TOOLTIP_CURSOR = { stroke: "var(--line-strong)", strokeWidth: 1 } as const;

export function formatMinutesAsDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
