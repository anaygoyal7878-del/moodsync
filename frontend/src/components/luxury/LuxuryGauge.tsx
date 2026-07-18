/** Ported from the Superdesign Weekly Insights page's stress/recovery
 * gauge SVG. Takes a real 0-100 wellness score (see
 * `WellnessScores`/`ScoreBasis` in lib/types.ts) instead of the draft's
 * hardcoded 45%/78%. Renders nothing but the ring + value when the
 * score is null (basis not computable yet) rather than drawing a fake
 * 0% ring. */
export function LuxuryGauge({
  value,
  label,
  color,
  statusLabel,
}: {
  value: number | null;
  label: string;
  color: string;
  statusLabel: string;
}) {
  const dash = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      className="flex flex-1 flex-col items-center rounded-[24px] p-5 text-center"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div className="relative mb-3 h-20 w-20">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="var(--lux-bg-card-2)"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${dash}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <div className="font-luxury-display absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular">
          {value === null ? "—" : `${Math.round(value)}%`}
        </div>
      </div>
      <span className="mb-1 text-[13px] font-medium">{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[10px] tracking-tight"
        style={{ background: `${color}1a`, color }}
      >
        {statusLabel}
      </span>
    </div>
  );
}
