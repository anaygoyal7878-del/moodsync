import { Card } from "@/components/ui/Card";
import { TrendChart } from "@/components/ui/charts/TrendChart";
import { HeartRatePulse } from "./HeartRatePulse";
import { WellnessTimeline } from "./WellnessTimeline";
import { metricLabel, METRIC_UNITS } from "@/lib/metrics";
import type { NormalizedBiometricReading } from "@moodsync/shared";

const METRIC_ORDER: Array<keyof NormalizedBiometricReading> = [
  "recoveryScore",
  "sleepScore",
  "heartRate",
  "restingHeartRate",
  "stressLevel",
  "activityLevel",
  "steps",
  "calories",
];

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
}

export function BiometricsSection({
  latest,
  history,
}: {
  latest: NormalizedBiometricReading | null;
  history: NormalizedBiometricReading[];
}) {
  // `history` arrives newest-first (see /api/biometrics/history) —
  // TrendChart reads left-to-right chronologically, so reverse it.
  const heartRateSeries = [...history]
    .reverse()
    .filter((r) => r.heartRate !== undefined)
    .map((r) => ({ date: shortTime(r.timestamp), value: r.heartRate as number }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Today&apos;s biometrics</h2>

      {!latest ? (
        <Card className="flex flex-col items-start gap-1.5 py-6">
          <p className="text-sm font-medium text-ink">No biometric data yet</p>
          <p className="text-sm text-ink-secondary">Connect a wearable and sync to see readings here.</p>
        </Card>
      ) : (
        <>
          <HeartRatePulse latest={latest} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRIC_ORDER.filter((key) => latest[key] !== undefined).map((key) => (
              <Card key={key} className="py-4 transition-colors hover:bg-surface-hover">
                <p className="text-xs uppercase tracking-wide text-ink-muted">{metricLabel(key)}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {String(latest[key])}
                  {METRIC_UNITS[key] && <span className="ml-1 text-sm font-normal text-ink-secondary">{METRIC_UNITS[key]}</span>}
                </p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            As of {new Date(latest.timestamp).toLocaleString()} · from {latest.provider}
          </p>
        </>
      )}

      {heartRateSeries.length > 1 && (
        <Card>
          <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Heart rate · last {heartRateSeries.length} readings</p>
          <TrendChart data={heartRateSeries} label="Heart rate" unit="bpm" color="var(--brand)" />
        </Card>
      )}

      <WellnessTimeline history={history} />
    </section>
  );
}
