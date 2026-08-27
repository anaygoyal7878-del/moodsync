import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { Moon, Bed, Thermometer, Wind, MonitorOff, Lightbulb, Sparkles, CalendarClock } from "lucide-react";
import { PageHeader, Section, Meter, Stat, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { SleepCoachResponse, WindDownStep } from "@/lib/types";

const STEP_ICON: Record<WindDownStep["kind"], typeof Moon> = {
  temperature: Thermometer,
  light: Lightbulb,
  breathing: Wind,
  screens: MonitorOff,
  scene: Sparkles,
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Sleep — the coach, not the chart.
 *
 * The headline is a bedtime the user can act on, worked backwards from
 * their first real commitment tomorrow. Below it, a wind-down routine
 * built only from signals that exist for this person (their bedroom
 * temperature, their stress reading, their own HomeKit scene) rather
 * than generic sleep-hygiene advice.
 *
 * Deliberately absent: bedtime-consistency coaching. MoodSync stores
 * sleep scores and stage minutes but no sleep-session start times, so
 * "your bedtime is drifting later" is not something this app can say
 * honestly — see ai/src/sleepCoach.ts and docs/SLEEP_COACH.md.
 */
export default async function SleepPage() {
  const result = await backendFetch<SleepCoachResponse>("/api/sleep-coach");
  const data = result.ok ? result.data : null;

  const quality = data?.quality;
  const target = data?.bedtimeTarget;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sleep" subtitle="Tonight's plan, and how the last few nights actually went." />

      <div className="lux-stagger-2">
        <Section title="Tonight's target" subtitle={target ? undefined : "Needs a connected calendar."} icon={Bed}>
          {target ? (
            <>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-sage)" }}>
                    Start winding down
                  </p>
                  <p
                    className="font-luxury-display tabular mt-1 text-[32px] font-semibold leading-none"
                    style={{ color: "var(--lux-ink)" }}
                  >
                    {formatTime(target.windDownAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
                    Asleep by
                  </p>
                  <p
                    className="font-luxury-display tabular mt-1 text-[24px] font-semibold leading-none"
                    style={{ color: "var(--lux-muted)" }}
                  >
                    {formatTime(target.asleepBy)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                {target.reason}
              </p>
            </>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No bedtime target"
              body="MoodSync works this back from your first commitment tomorrow. Without a calendar, any wake time would be a guess — so it doesn't make one."
              action={
                <Link
                  href="/dashboard/connections"
                  className="rounded-full px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--lux-sage)", color: "#1a241e" }}
                >
                  Connect a calendar
                </Link>
              }
            />
          )}
        </Section>
      </div>

      <div className="lux-stagger-3">
        <Section title="Wind-down" subtitle="Built from what's actually true in your home tonight." icon={Moon}>
          <ol className="flex flex-col gap-3">
            {(data?.windDown ?? []).map((step, index) => {
              const Icon = STEP_ICON[step.kind];
              return (
                <li key={step.label} className="flex gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" }}
                  >
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                      <span className="tabular mr-1.5" style={{ color: "var(--lux-muted)" }}>
                        {index + 1}.
                      </span>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                      {step.reason}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      </div>

      <div className="lux-stagger-4">
        <Section title="Recent sleep" subtitle={quality ? `${quality.nightsMeasured} night${quality.nightsMeasured === 1 ? "" : "s"} measured` : undefined} icon={Moon}>
          {quality && quality.nightsMeasured > 0 ? (
            <>
              <Meter value={quality.averageScore} label="Average" ariaLabel="Average sleep score" />
              <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
                {quality.averageTotalMinutes !== null && (
                  <Stat label="Time asleep" value={formatDuration(quality.averageTotalMinutes)} hint="Nightly average" />
                )}
                {quality.lastNightVsAverage !== null && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
                      Last night
                    </p>
                    <p
                      className="font-luxury-display tabular mt-0.5 text-[19px] font-semibold"
                      style={{ color: quality.lastNightVsAverage >= 0 ? toneColor("positive") : toneColor("critical") }}
                    >
                      {quality.lastNightVsAverage > 0 ? "+" : ""}
                      {quality.lastNightVsAverage}
                    </p>
                    <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
                      vs. your average
                    </p>
                  </div>
                )}
              </div>
              {quality.averageTotalMinutes === null && (
                <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                  Your provider reports a sleep score but no stage breakdown, so total time asleep isn&apos;t available.
                  WHOOP and Fitbit report stages; Apple Health and Amazfit report the score alone.
                </p>
              )}
            </>
          ) : (
            <EmptyState
              icon={Moon}
              title="No nights measured yet"
              body="Sleep quality appears once a connected wearable has recorded a full night."
            />
          )}
        </Section>
      </div>
    </div>
  );
}
