import type { ReactNode } from "react";
import Link from "next/link";
import { HeartPulse, Moon, Flame } from "lucide-react";
import { PageHeader, Section } from "@/components/companion/CompanionPrimitives";
import { ScoreRing } from "@/components/ui/charts/ScoreRing";
import { MetricAreaChart, type MetricPoint } from "@/components/ui/charts/MetricAreaChart";
import { DailyBarChart } from "@/components/ui/charts/DailyBarChart";
import { SleepStagesChart, type SleepStagesPoint } from "@/components/ui/charts/SleepStagesChart";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { WellnessTimeline } from "./WellnessTimeline";
import { WEARABLE_LABELS } from "@/lib/providerDisplay";
import { sampleBiometricHistory, sampleLatestReading } from "@/lib/sampleData";
import type { NormalizedBiometricReading } from "@moodsync/shared";

/**
 * The Health page: one hue per metric (see --viz-* in globals.css —
 * validated as a set for this surface), one labeled panel per metric,
 * grouped Heart / Sleep / Activity the way a wearable-native health app
 * lays it out. Every chart is single-series inside its own labeled
 * panel, so identity never rides on color alone and no legend is needed
 * anywhere except the sleep-stage stack (which has one).
 */

type NumericKey =
  | "heartRate"
  | "restingHeartRate"
  | "heartRateVariability"
  | "respiratoryRate"
  | "bloodOxygen"
  | "sleepScore"
  | "recoveryScore"
  | "activityLevel"
  | "steps"
  | "calories";

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** Full-resolution chronological series for one metric. */
function intradaySeries(chronological: NormalizedBiometricReading[], key: NumericKey): MetricPoint[] {
  return chronological
    .filter((r) => r[key] !== undefined)
    .map((r) => ({ x: shortTime(r.timestamp), value: r[key] as number }));
}

/** One point per calendar day (the day's last reading that has the
 * metric) — the right resolution for once-a-day values like resting HR
 * or sleep score, where plotting every sync would just repeat the same
 * number. */
function dailySeries(chronological: NormalizedBiometricReading[], key: NumericKey): MetricPoint[] {
  const byDay = new Map<string, NormalizedBiometricReading>();
  for (const reading of chronological) {
    if (reading[key] !== undefined) byDay.set(dayKey(reading.timestamp), reading);
  }
  return [...byDay.values()].map((r) => ({ x: shortDay(r.timestamp), value: r[key] as number }));
}

function sleepStagesSeries(chronological: NormalizedBiometricReading[]): SleepStagesPoint[] {
  const byDay = new Map<string, NormalizedBiometricReading>();
  for (const reading of chronological) {
    if (
      reading.deepSleepMinutes !== undefined ||
      reading.remSleepMinutes !== undefined ||
      reading.lightSleepMinutes !== undefined
    ) {
      byDay.set(dayKey(reading.timestamp), reading);
    }
  }
  return [...byDay.values()].map((r) => ({
    x: shortDay(r.timestamp),
    deep: r.deepSleepMinutes ?? 0,
    rem: r.remSleepMinutes ?? 0,
    light: r.lightSleepMinutes ?? 0,
  }));
}

function formatDelta(series: MetricPoint[], unit?: string): string | null {
  if (series.length < 2) return null;
  const delta = series[series.length - 1].value - series[0].value;
  if (delta === 0) return "flat this week";
  const magnitude = Math.abs(Math.round(delta * 10) / 10);
  return `${delta > 0 ? "▲" : "▼"} ${magnitude}${unit ? ` ${unit}` : ""} this week`;
}

/** One labeled metric panel: colored identity dot + name, the latest
 * value large, an optional week-over-week delta, and the metric's chart
 * below. The panel border is a hairline on the section's own surface so
 * the chart renders on the exact card color the palette was validated
 * against. */
/**
 * Shown when a section has a current reading but no series inside the
 * chart window — connected and syncing, just not enough history to draw
 * a line yet.
 *
 * Deliberately not an error and not a "connect a device" prompt: both
 * would be wrong for someone whose wearable is working fine. The number
 * they do have is still shown, because one real reading is worth more
 * than an apology about the ones that are missing.
 */
function NoSeriesYet({ current, unit, label }: { current: string | null; unit?: string; label: string }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[16px] p-4 sm:col-span-2"
      style={{ background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" }}
    >
      {current !== null && (
        <div className="flex items-baseline gap-1">
          <span className="font-luxury-display tabular text-[26px] font-semibold leading-none" style={{ color: "var(--lux-ink)" }}>
            {current}
          </span>
          {unit && (
            <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
              {unit}
            </span>
          )}
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
        {current !== null
          ? `That's your most recent ${label}. There isn't enough history in this window to chart a trend yet — it fills in as your device keeps syncing.`
          : `No ${label} has synced into this window yet. It fills in as your device keeps syncing.`}
      </p>
    </div>
  );
}

function MetricPanel({
  label,
  color,
  value,
  unit,
  delta,
  children,
  className = "",
}: {
  label: string;
  color: string;
  value: string | null;
  unit?: string;
  delta?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[16px] p-4 ${className}`} style={{ border: "1px solid var(--lux-hairline)" }}>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
          {label}
        </p>
      </div>
      {value !== null && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-luxury-display tabular text-[26px] font-semibold leading-none" style={{ color: "var(--lux-ink)" }}>
            {value}
            {unit && (
              <span className="ml-1 text-[13px] font-normal" style={{ color: "var(--lux-muted)" }}>
                {unit}
              </span>
            )}
          </p>
          {delta && (
            <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
              {delta}
            </p>
          )}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function providerLabel(provider: string): string {
  return (WEARABLE_LABELS[provider.toUpperCase()] as string | undefined) ?? provider;
}

export function BiometricsSection({
  latest,
  history,
  embedded = false,
}: {
  latest: NormalizedBiometricReading | null;
  history: NormalizedBiometricReading[];
  /** True when this renders inside another page (the Today home page)
   * rather than as its own route — drops the page-level header. */
  embedded?: boolean;
}) {
  // With nothing connected, draw the sample week instead of an empty
  // page — but only ever behind a visible "Sample data" badge (see
  // lib/sampleData.ts). Real readings always win; there is no way to
  // reach this fallback while any exist.
  const isSample = latest === null;
  const effectiveLatest = latest ?? sampleLatestReading();
  const effectiveHistory = isSample ? sampleBiometricHistory() : history;

  // `history` arrives newest-first (see /api/biometrics/history); every
  // chart reads left-to-right chronologically.
  const chronological = [...effectiveHistory].reverse();

  const heartRate = intradaySeries(chronological, "heartRate");
  const restingHR = dailySeries(chronological, "restingHeartRate");
  const hrv = dailySeries(chronological, "heartRateVariability");
  const bloodOxygen = dailySeries(chronological, "bloodOxygen");
  const sleepScore = dailySeries(chronological, "sleepScore");
  const sleepStages = sleepStagesSeries(chronological);
  const steps = dailySeries(chronological, "steps");
  const calories = dailySeries(chronological, "calories");

  // The newest reading that actually carries the metric — NOT just the
  // newest reading overall. Intraday syncs are sparse (a midday push has
  // heart rate and steps but no sleep score), so reading every metric
  // off `latest` alone would blank the sleep ring the moment any
  // afternoon sync lands.
  const latestOf = (key: NumericKey): number | null => {
    for (let i = chronological.length - 1; i >= 0; i--) {
      const value = chronological[i][key];
      if (value !== undefined) return value as number;
    }
    const value = effectiveLatest[key];
    return value === undefined ? null : (value as number);
  };

  const rings = [
    { label: "Recovery", value: latestOf("recoveryScore"), color: "var(--viz-recovery)" },
    { label: "Sleep", value: latestOf("sleepScore"), color: "var(--viz-sleep)" },
    { label: "Activity", value: latestOf("activityLevel"), color: "var(--viz-activity)" },
  ].filter((ring) => ring.value !== null);


  const hasHeartData = latestOf("heartRate") !== null || restingHR.length > 0 || hrv.length > 0 || bloodOxygen.length > 0;
  const hasSleepData = sleepScore.length > 0 || sleepStages.length > 0;
  const hasActivityData = steps.length > 0 || calories.length > 0 || latestOf("activityLevel") !== null;

  // Whether any *series* exists to plot, which is a different question
  // from whether the section has data at all.
  //
  // This gap was a real bug: `hasHeartData` is satisfied by a single
  // latest reading, while every panel inside the section is gated on the
  // history arrays. A user who synced recently but has nothing inside
  // the chart window passed the section guard and then rendered a card
  // containing a title and nothing else — no chart, no explanation, no
  // indication anything was wrong. Sleep escaped it only because its
  // guard happens to check arrays rather than the latest reading.
  const heartSeriesEmpty = heartRate.length === 0 && restingHR.length === 0 && hrv.length === 0 && bloodOxygen.length === 0;
  const activitySeriesEmpty = steps.length === 0 && calories.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {!embedded && (
        <PageHeader
          title="Health"
          subtitle={
            isSample
              ? "A sample week — connect a wearable to see your own."
              : `As of ${new Date(effectiveLatest.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${providerLabel(effectiveLatest.provider)}`
          }
        />
      )}

      {isSample && (
        <div
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[16px] px-4 py-3"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline-gold)" }}
        >
          <SampleBadge />
          <p className="text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
            No wearable connected yet — these are example readings, not yours.
          </p>
          <Link
            href="/dashboard/connections"
            className="text-[12.5px] font-medium underline underline-offset-2"
            style={{ color: "var(--lux-sage)" }}
          >
            Connect one
          </Link>
        </div>
      )}

      {rings.length > 0 && (
        <Section
          title="Today"
          subtitle={isSample ? "Example scores out of 100." : "Scores out of 100, from your latest sync."}
          className="lux-stagger-1"
          action={isSample ? <SampleBadge /> : undefined}
        >
          <div className="flex flex-wrap items-start justify-around gap-x-6 gap-y-4 py-1">
            {rings.map((ring) => (
              <ScoreRing key={ring.label} value={ring.value} label={ring.label} color={ring.color} />
            ))}
          </div>
        </Section>
      )}

      {hasHeartData && (
        <Section title="Heart" icon={HeartPulse} action={isSample ? <SampleBadge /> : undefined} className="lux-stagger-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {heartSeriesEmpty && (
              <NoSeriesYet
                current={latestOf("heartRate") !== null ? String(Math.round(latestOf("heartRate") as number)) : null}
                unit="bpm"
                label="heart rate"
              />
            )}
            {heartRate.length > 0 && (
              <MetricPanel
                label="Heart rate"
                color="var(--viz-heart)"
                value={latestOf("heartRate") !== null ? String(Math.round(latestOf("heartRate") as number)) : null}
                unit="bpm"
                className="sm:col-span-2"
              >
                <MetricAreaChart data={heartRate} color="var(--viz-heart)" label="Heart rate" unit="bpm" />
              </MetricPanel>
            )}
            {restingHR.length > 0 && (
              <MetricPanel
                label="Resting heart rate"
                color="var(--viz-rhr)"
                value={String(restingHR[restingHR.length - 1].value)}
                unit="bpm"
                delta={formatDelta(restingHR, "bpm")}
              >
                <MetricAreaChart data={restingHR} color="var(--viz-rhr)" label="Resting HR" unit="bpm" height={120} />
              </MetricPanel>
            )}
            {hrv.length > 0 && (
              <MetricPanel
                label="Heart rate variability"
                color="var(--viz-hrv)"
                value={String(Math.round(hrv[hrv.length - 1].value))}
                unit="ms"
                delta={formatDelta(hrv, "ms")}
              >
                <MetricAreaChart data={hrv} color="var(--viz-hrv)" label="HRV" unit="ms" height={120} />
              </MetricPanel>
            )}
            {bloodOxygen.length > 0 && (
              <MetricPanel
                label="Blood oxygen"
                color="var(--viz-oxygen)"
                value={String(bloodOxygen[bloodOxygen.length - 1].value)}
                unit="% SpO₂"
                delta={formatDelta(bloodOxygen, "%")}
              >
                <MetricAreaChart data={bloodOxygen} color="var(--viz-oxygen)" label="SpO₂" unit="%" height={120} domain={[85, 100]} />
              </MetricPanel>
            )}
            {latestOf("respiratoryRate") !== null && (
              <MetricPanel
                label="Respiratory rate"
                color="var(--lux-muted)"
                value={String(latestOf("respiratoryRate"))}
                unit="breaths/min"
              />
            )}
          </div>
        </Section>
      )}

      {hasSleepData && (
        <Section title="Sleep" icon={Moon} action={isSample ? <SampleBadge /> : undefined} className="lux-stagger-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sleepScore.length > 0 && (
              <MetricPanel
                label="Sleep score"
                color="var(--viz-sleep)"
                value={String(sleepScore[sleepScore.length - 1].value)}
                unit="/100"
                delta={formatDelta(sleepScore)}
                className={sleepStages.length === 0 ? "sm:col-span-2" : undefined}
              >
                <MetricAreaChart data={sleepScore} color="var(--viz-sleep)" label="Sleep score" height={140} domain={[0, 100]} />
              </MetricPanel>
            )}
            {sleepStages.length > 0 && (
              <MetricPanel
                label="Sleep stages"
                color="var(--viz-sleep-deep)"
                value={null}
                className={sleepScore.length === 0 ? "sm:col-span-2" : undefined}
              >
                <SleepStagesChart data={sleepStages} height={160} />
              </MetricPanel>
            )}
          </div>
        </Section>
      )}

      {hasActivityData && (
        <Section title="Activity" icon={Flame} action={isSample ? <SampleBadge /> : undefined} className="lux-stagger-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activitySeriesEmpty && (
              <NoSeriesYet
                current={latestOf("activityLevel") !== null ? String(Math.round(latestOf("activityLevel") as number)) : null}
                label="activity"
              />
            )}
            {steps.length > 0 && (
              <MetricPanel
                label="Steps"
                color="var(--viz-activity)"
                value={steps[steps.length - 1].value.toLocaleString()}
                delta={formatDelta(steps)}
                className="sm:col-span-2"
              >
                <DailyBarChart data={steps} color="var(--viz-activity)" label="Steps" />
              </MetricPanel>
            )}
            {calories.length > 0 && (
              <MetricPanel
                label="Active calories"
                color="var(--viz-activity)"
                value={Math.round(calories[calories.length - 1].value).toLocaleString()}
                unit="kcal"
                delta={formatDelta(calories, "kcal")}
              >
                <MetricAreaChart data={calories} color="var(--viz-activity)" label="Calories" unit="kcal" height={120} />
              </MetricPanel>
            )}
            {latestOf("activityLevel") !== null && (
              <MetricPanel label="Activity level" color="var(--viz-activity)" value={String(latestOf("activityLevel"))} unit="/100" />
            )}
          </div>
        </Section>
      )}

      <WellnessTimeline history={history} />
    </div>
  );
}
