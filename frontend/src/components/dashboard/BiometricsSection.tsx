import { Card } from "@/components/ui/Card";
import type { NormalizedBiometricReading } from "@moodsync/shared";

const METRICS: Array<{ key: keyof NormalizedBiometricReading; label: string; unit: string }> = [
  { key: "recoveryScore", label: "Recovery", unit: "" },
  { key: "sleepScore", label: "Sleep", unit: "" },
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "restingHeartRate", label: "Resting HR", unit: "bpm" },
  { key: "stressLevel", label: "Stress", unit: "" },
  { key: "activityLevel", label: "Activity", unit: "" },
  { key: "steps", label: "Steps", unit: "" },
  { key: "calories", label: "Calories", unit: "kcal" },
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
        <Card>
          <p className="text-sm text-ink-secondary">
            No biometric data yet. Connect a wearable and sync to see readings here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRICS.filter((m) => latest[m.key] !== undefined).map((m) => (
              <Card key={m.key} className="py-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted">{m.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {String(latest[m.key])}
                  {m.unit && <span className="ml-1 text-sm font-normal text-ink-secondary">{m.unit}</span>}
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
