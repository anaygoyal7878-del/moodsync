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
  // Gold hairline and a lifted shadow rather than a flat grey border.
  // The tooltip is the one chart surface that floats above everything
  // else, so it is the one place the elevation ladder should be most
  // obvious — a floating panel that reads as flat is what makes a chart
  // feel like a developer tool.
  border: "1px solid var(--lux-hairline-gold)",
  borderRadius: "14px",
  fontSize: "0.75rem",
  color: "var(--lux-ink)",
  boxShadow: "var(--elev-2)",
  padding: "8px 10px",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--lux-muted)",
  fontSize: "0.7rem",
  marginBottom: "2px",
};

/** Crosshair line under the hover point on line/area charts. Gold and
 * thin: it marks *where you are*, which is exactly the "this is the
 * point that matters" job the accent exists for. */
export const TOOLTIP_CURSOR = { stroke: "var(--gold-muted)", strokeWidth: 1 } as const;

/**
 * The hovered point on a line or area series.
 *
 * Gold ring on a dark core, with the series colour kept as the fill —
 * so the highlight reads as the same accent language everywhere while
 * the point still belongs to its own metric. The stroke is the card
 * background rather than a colour, which is what makes the dot appear
 * to sit *above* the line instead of being welded into it.
 */
export const ACTIVE_DOT = {
  r: 4.5,
  strokeWidth: 2,
  stroke: "var(--lux-bg-card)",
} as const;

/** Emphasis version for the single most important series on a chart. */
export const ACTIVE_DOT_GOLD = {
  r: 5,
  strokeWidth: 2,
  stroke: "var(--gold)",
} as const;

export function formatMinutesAsDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
