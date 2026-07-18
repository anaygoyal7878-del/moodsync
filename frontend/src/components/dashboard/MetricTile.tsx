import { Card } from "@/components/ui/Card";

/** A compact, glanceable metric card for the dashboard home grid — the
 * same "number + label" shape WellnessScoreCard/BiometricsSection
 * already use, pulled out into one shared component since the home page
 * mixes computed wellness scores and raw biometric values side by side
 * and both should look identical. `moodClassName` (e.g. "text-mood-calm")
 * is optional so raw biometrics (which have no wellness-state mapping)
 * render in the default ink color. */
export function MetricTile({
  label,
  value,
  unit,
  moodClassName,
  sublabel,
}: {
  label: string;
  value: number | null;
  unit?: string;
  moodClassName?: string;
  sublabel?: string;
}) {
  return (
    <Card className="py-4 transition-colors hover:bg-surface-hover">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 flex items-baseline gap-1 text-2xl font-semibold tabular-nums ${value !== null ? (moodClassName ?? "") : ""}`}>
        {value === null ? <span className="text-base font-normal text-ink-muted">—</span> : value}
        {value !== null && unit && <span className="text-sm font-normal text-ink-muted">{unit}</span>}
      </p>
      {sublabel && <p className="mt-1 text-[11px] text-ink-muted">{sublabel}</p>}
    </Card>
  );
}
