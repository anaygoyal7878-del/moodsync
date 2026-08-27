"use client";

import { useId } from "react";

/**
 * Circular 0–100 score gauge — the "today at a glance" hero mark.
 * Pure SVG (no chart library): a ring is one arc, and recharts' radial
 * charts bring layout baggage without adding anything here.
 *
 * The value also appears as text in the center, so the arc length is
 * reinforcement rather than the only encoding — the number is the
 * accessible reading, exposed via aria-label on the figure.
 */
export function ScoreRing({
  value,
  label,
  color,
  size = 104,
}: {
  /** 0–100, or null when the metric exists but has no reading today. */
  value: number | null;
  label: string;
  /** A CSS color (typically one of the --viz-* tokens). */
  color: string;
  size?: number;
}) {
  const gradientId = useId();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value));
  const filled = (clamped / 100) * circumference;

  return (
    <figure
      className="flex flex-col items-center gap-2"
      role="img"
      aria-label={value === null ? `${label}: no reading yet` : `${label}: ${Math.round(clamped)} out of 100`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--lux-bg-card-2)" strokeWidth={stroke} />
          {value !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference - filled}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-luxury-display tabular text-[26px] font-semibold leading-none" style={{ color: "var(--lux-ink)" }}>
            {value === null ? "—" : Math.round(clamped)}
          </span>
          {value !== null && (
            <span className="text-[10px]" style={{ color: "var(--lux-muted)" }}>
              /100
            </span>
          )}
        </div>
      </div>
      <figcaption className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--lux-muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
      </figcaption>
    </figure>
  );
}
