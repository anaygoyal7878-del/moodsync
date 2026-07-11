import { Card } from "@/components/ui/Card";
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

export function BiometricsSection({
  latest,
  history,
}: {
  latest: NormalizedBiometricReading | null;
  history: NormalizedBiometricReading[];
}) {
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

      {history.length > 1 && (
        <Card>
          <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Last {history.length} readings</p>
          <div className="flex flex-col gap-1.5">
            {history.slice(0, 10).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm text-ink-secondary">
                <span>{new Date(r.timestamp).toLocaleString()}</span>
                <span className="tabular-nums">
                  {r.recoveryScore !== undefined ? `Recovery ${r.recoveryScore}` : ""}
                  {r.sleepScore !== undefined ? ` · Sleep ${r.sleepScore}` : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
