"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";
import { MetricAreaChart, type MetricPoint } from "@/components/ui/charts/MetricAreaChart";
import { Metric, MetricRow } from "@/components/companion/CompanionPrimitives";
import type { NormalizedBiometricReading } from "@moodsync/shared";
import type { HealthProfileResponse } from "@/lib/types";

/**
 * Heart-rate analytics, under the focus timer.
 *
 * Placed here because this is where someone is about to ask their body
 * for sustained attention, and the two questions worth answering at that
 * moment are "where am I right now" and "is today unusual for me". So
 * the section leads with the current reading against the person's own
 * resting baseline, then shows today's curve, then the week — narrowing
 * from now to context rather than the other way round.
 *
 * Heart-rate zones appear once the person has entered a birthday on
 * their profile: zones are percentages of maximum heart rate, which
 * needs age or a measured max. Without one there is no zone line at all,
 * rather than zones computed off a guessed maximum — confident labels on
 * arbitrary bands.
 *
 * Every comparison is to this person's own history. A resting heart rate
 * of 58 is unremarkable for one person and worth noticing for another,
 * and a population norm cannot tell the two apart.
 */

const DAY_MS = 24 * 60 * 60_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function shortDay(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short" });
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function HeartRateAnalytics() {
  const [readings, setReadings] = useState<NormalizedBiometricReading[] | null>(null);
  // When the readings arrived. "Last 24 hours" is measured from here
  // rather than from Date.now() during render, which is impure and would
  // let the window shift on an unrelated re-render.
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [zones, setZones] = useState<HealthProfileResponse["derived"]["zones"]>(null);
  const [zoneBasis, setZoneBasis] = useState<"measured" | "tanaka-2001" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/biometrics/history?days=7")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { readings?: NormalizedBiometricReading[] }) => {
        if (cancelled) return;
        setReadings(data.readings ?? []);
        setLoadedAt(Date.now());
      })
      .catch(() => {
        if (!cancelled) setError("Your heart-rate history couldn't be loaded right now.");
      });
    // Zones are optional context: a failure here drops the zone line and
    // nothing else.
    fetch("/api/health-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: HealthProfileResponse | null) => {
        if (cancelled || !body) return;
        setZones(body.derived.zones);
        setZoneBasis(body.derived.maxHeartRate?.basis ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const analytics = useMemo(() => {
    if (!readings || loadedAt === null) return null;
    const sorted = [...readings].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const withHr = sorted.filter((r) => typeof r.heartRate === "number");
    const latest = withHr.at(-1) ?? null;

    // Today = the last 24 hours rather than the calendar day, so the
    // curve isn't nearly empty at 8am.
    const cutoff = loadedAt - DAY_MS;
    const today: MetricPoint[] = withHr
      .filter((r) => new Date(r.timestamp).getTime() >= cutoff)
      .map((r) => ({ x: shortTime(r.timestamp), value: r.heartRate as number }));

    // One resting value per day — the lowest reported, since resting HR
    // is by definition the floor and averaging would drag it upward on
    // days with more daytime samples.
    const restingByDay = new Map<string, number>();
    for (const r of sorted) {
      if (typeof r.restingHeartRate !== "number") continue;
      const key = dayKey(r.timestamp);
      const prev = restingByDay.get(key);
      restingByDay.set(key, prev === undefined ? r.restingHeartRate : Math.min(prev, r.restingHeartRate));
    }
    const week: MetricPoint[] = [...restingByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ x: shortDay(key), value }));

    // Baseline excludes today, so today is never compared against an
    // average it contributed to.
    const priorResting = week.slice(0, -1).map((p) => p.value);
    const restingBaseline =
      priorResting.length >= 3 ? priorResting.reduce((s, v) => s + v, 0) / priorResting.length : null;
    const restingToday = week.at(-1)?.value ?? null;
    const restingDelta =
      restingToday !== null && restingBaseline !== null ? Math.round(restingToday - restingBaseline) : null;

    const todayValues = today.map((p) => p.value);
    // A range needs at least two readings to be one. With a single
    // sample this rendered "78–78", which reads like a measurement of
    // spread when it is really the absence of one.
    const range =
      todayValues.length >= 2 ? { min: Math.min(...todayValues), max: Math.max(...todayValues) } : null;

    return { latest, today, week, restingToday, restingBaseline, restingDelta, range };
  }, [readings, loadedAt]);

  return (
    <section
      className="rounded-[24px] p-5"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)", boxShadow: "var(--elev-2)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <HeartPulse size={16} style={{ color: "var(--viz-heart)" }} aria-hidden="true" />
        <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          Heart rate
        </h2>
      </div>

      {error && (
        <p role="alert" className="text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
          {error}
        </p>
      )}

      {!error && analytics === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-[52px] animate-pulse rounded-[12px]" style={{ background: "var(--lux-bg-card-2)" }} />
          <div className="h-[150px] animate-pulse rounded-[12px]" style={{ background: "var(--lux-bg-card-2)" }} />
        </div>
      )}

      {analytics && analytics.latest === null && (
        <p className="lux-reveal text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          No heart-rate readings have synced in the last week. Once your wearable syncs, you&apos;ll see today&apos;s curve
          and how your resting rate compares with your normal.
        </p>
      )}

      {analytics && analytics.latest !== null && (
        <div className="lux-reveal flex flex-col gap-5">
          <MetricRow>
            <Metric value={analytics.latest.heartRate as number} unit="bpm" label="Latest" emphasis />
            <Metric
              value={analytics.restingToday ?? "—"}
              unit={analytics.restingToday !== null ? "bpm" : undefined}
              label="Resting today"
              {...(analytics.restingDelta !== null
                ? {
                    hint:
                      analytics.restingDelta === 0
                        ? "Same as your average"
                        : `${analytics.restingDelta > 0 ? "+" : ""}${analytics.restingDelta} vs your average`,
                  }
                : {})}
            />
            <Metric
              value={analytics.range ? `${analytics.range.min}–${analytics.range.max}` : "—"}
              label="Range, 24h"
            />
          </MetricRow>

          {zones && (() => {
            const hr = analytics.latest!.heartRate as number;
            const zone = [...zones].reverse().find((z) => hr >= z.minBpm) ?? null;
            return (
              <p className="-mt-2 text-[12px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                {zone ? (
                  <>
                    Latest reading is in{" "}
                    <span style={{ color: zone.zone >= 4 ? "var(--gold)" : "var(--lux-ink)" }}>
                      zone {zone.zone} · {zone.label.toLowerCase()}
                    </span>{" "}
                    ({zone.minBpm}–{zone.maxBpm} bpm).
                  </>
                ) : (
                  <>Latest reading is below zone 1 — resting range.</>
                )}{" "}
                {zoneBasis === "measured" ? "Zones from your measured maximum." : "Zones estimated from your age."}
              </p>
            );
          })()}

          {analytics.today.length >= 3 ? (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
                Last 24 hours
              </p>
              <MetricAreaChart data={analytics.today} color="var(--viz-heart)" label="Heart rate" unit="bpm" />
            </div>
          ) : (
            <p className="text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
              Not enough readings in the last 24 hours to draw a curve yet.
            </p>
          )}

          {analytics.week.length >= 3 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
                Resting heart rate, this week
              </p>
              <MetricAreaChart data={analytics.week} color="var(--viz-rhr)" label="Resting HR" unit="bpm" height={120} />
            </div>
          )}

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
            Compared with your own recent readings, not a population average. Wrist sensors estimate heart rate
            optically and can drift with movement or a loose fit.
          </p>
        </div>
      )}
    </section>
  );
}
