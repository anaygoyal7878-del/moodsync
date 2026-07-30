import { backendFetch } from "@/lib/api";
import { BatteryMedium, Users, Activity, CalendarClock } from "lucide-react";
import { LiveEnergyMeter } from "@/components/luxury/LiveEnergyMeter";
import { PageHeader, Section, Meter, Reasons, Stat, EmptyState, AiEstimateNote, toneColor } from "@/components/companion/CompanionPrimitives";
import { StressTimeline } from "@/components/companion/StressTimeline";
import type { DailyBriefResponse, SocialBatteryResponse } from "@/lib/types";

const LEVEL_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

/**
 * Energy — the "how much have I got" page.
 *
 * Three different questions, deliberately kept distinct rather than
 * collapsed into one number: how much physical energy right now (the
 * live meter), how much social/mental capacity today (an explicitly
 * labeled AI estimate), and where the day's stress actually moved (the
 * timeline). Each carries its own reasoning.
 */
export default async function EnergyPage() {
  const [briefResult, batteryResult] = await Promise.all([
    backendFetch<DailyBriefResponse>("/api/daily-brief"),
    backendFetch<SocialBatteryResponse>("/api/social-battery"),
  ]);

  const brief = briefResult.ok ? briefResult.data : null;
  const battery = batteryResult.ok ? batteryResult.data : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Energy" subtitle="What you have right now, and what today is asking of you." />

      {/* The live, polling meter — the one number on this page that
          moves minute to minute. */}
      <div className="lux-stagger-2">
        <LiveEnergyMeter />
      </div>

      <div className="lux-stagger-3 grid gap-4 lg:grid-cols-2">
        <Section title="Readiness" subtitle="Set by last night. Doesn't move much through the day." icon={Activity}>
          {brief?.hasData ? (
            <>
              <Meter value={brief.readiness.value} ariaLabel="Today's readiness" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Stat label="Sleep" value={brief.scores?.sleep.value?.toString() ?? "—"} />
                <Stat label="Recovery" value={brief.scores?.recovery.value?.toString() ?? "—"} />
              </div>
              <AiEstimateNote>
                Readiness is MoodSync&apos;s own blend of your recovery and sleep scores, weighted toward recovery. It is an
                interpretation of your data, not a measurement from your device.
              </AiEstimateNote>
            </>
          ) : (
            <EmptyState
              icon={Activity}
              title="No readiness yet"
              body="Readiness comes from overnight recovery and sleep. Connect a wearable and it'll appear after your first full night."
            />
          )}
        </Section>

        <Section title="Social battery" subtitle="How much capacity you likely have for people today." icon={Users}>
          {battery?.battery ? (
            <>
              <Meter
                value={battery.battery.value}
                label={LEVEL_LABEL[battery.battery.level]}
                ariaLabel="Social battery estimate"
              />
              {battery.guidance && (
                <p className="mt-3 text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                  {battery.guidance}
                </p>
              )}
              <Reasons className="mt-3" items={battery.battery.reasons.map((r) => r.charAt(0).toUpperCase() + r.slice(1))} />
              <AiEstimateNote>{battery.battery.disclaimer}</AiEstimateNote>
            </>
          ) : (
            <EmptyState
              icon={Users}
              title="Not enough to estimate"
              body="Social battery needs at least a sleep or recovery score from a connected wearable."
            />
          )}
        </Section>
      </div>

      {brief?.hasData && brief.bookedHoursToday !== null && brief.bookedHoursToday !== undefined && (
        <div className="lux-stagger-4">
          <Section title="Today's load" subtitle="From your connected calendar." icon={CalendarClock}>
            <div className="flex gap-8">
              <Stat label="Booked" value={`${brief.bookedHoursToday}h`} />
              <Stat
                label="Events"
                value={brief.eventCountToday?.toString() ?? "—"}
                hint={brief.bookedHoursToday >= 5 ? "A heavy day" : "A manageable day"}
              />
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--lux-bg-card-2)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (brief.bookedHoursToday / 8) * 100)}%`,
                  background: brief.bookedHoursToday >= 5 ? toneColor("caution") : toneColor("positive"),
                }}
              />
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
              Against an 8-hour day.
            </p>
          </Section>
        </div>
      )}

      <div className="lux-stagger-5">
        <StressTimeline />
      </div>

      {!brief?.hasData && (
        <Section title="Getting started" icon={BatteryMedium}>
          <EmptyState
            icon={BatteryMedium}
            title="Connect a wearable"
            body="Energy, readiness and social battery all read from heart rate, sleep and recovery data. Everything on this page fills in once a device syncs."
          />
        </Section>
      )}
    </div>
  );
}
