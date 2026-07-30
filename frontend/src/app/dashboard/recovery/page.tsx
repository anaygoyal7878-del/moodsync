import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { HeartPulse, AlertTriangle, Footprints, Droplets, Wind, Clock, Brain } from "lucide-react";
import { PageHeader, Section, Meter, Stat, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { DailyBriefResponse, WellnessMemoryResponse } from "@/lib/types";

/**
 * The four recovery actions MoodSync suggests when the signals point
 * that way. These are fixed and deliberately unglamorous — walking,
 * hydrating, breathing, stopping earlier — because they're the ones with
 * a real evidence base and no equipment. What changes with the data is
 * *whether* this page leads with them and what reason is given, not the
 * list itself.
 */
const RECOVERY_ACTIONS = [
  {
    icon: Footprints,
    label: "A 20-minute walk",
    body: "Low-intensity movement, outside if you can. The most reliable thing on this list.",
  },
  { icon: Wind, label: "Five minutes of slow breathing", body: "Longer exhale than inhale. Works in a chair, anywhere.", href: "/dashboard/meditation" },
  { icon: Droplets, label: "Hydrate", body: "Dehydration shows up as elevated resting heart rate before it shows up as thirst." },
  { icon: Clock, label: "End work earlier", body: "The cheapest recovery intervention there is, and the one most often skipped." },
] as const;

/**
 * Recovery — what to do when the numbers say back off.
 *
 * Leads with the burnout signal when it's firing, then the actual
 * recovery/stress readings, then the small set of things worth doing.
 * The Wellness Memory section at the bottom is the part that makes this
 * personal rather than generic: it reports which of these actions have
 * historically moved *this user's* recovery, from their own before/after
 * history, and says how many times it's seen each one.
 */
export default async function RecoveryPage() {
  const [briefResult, memoryResult] = await Promise.all([
    backendFetch<DailyBriefResponse>("/api/daily-brief"),
    backendFetch<WellnessMemoryResponse>("/api/wellness-memory"),
  ]);

  const brief = briefResult.ok ? briefResult.data : null;
  const memory = memoryResult.ok ? memoryResult.data : null;
  const recovery = brief?.scores?.recovery.value ?? null;
  const stress = brief?.scores?.stress.value ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Recovery" subtitle="Where you stand, and what actually helps you." />

      {brief?.burnout && (
        <section
          className="lux-stagger-1 flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "rgba(217,168,200,0.12)", border: "1px solid var(--lux-rose)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--lux-rose)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {brief.burnout.title}
            </p>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--lux-muted)" }}>
              {brief.burnout.body}
            </p>
          </div>
        </section>
      )}

      <div className="lux-stagger-2 grid gap-4 lg:grid-cols-2">
        <Section title="Recovery" subtitle="How prepared your body is for load." icon={HeartPulse}>
          {recovery !== null ? (
            <>
              <Meter value={recovery} ariaLabel="Recovery score" />
              <p className="mt-3 text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                {brief?.scores?.recovery.basis === "provider-native"
                  ? "Reported directly by your wearable."
                  : "MoodSync's own estimate from your HRV and resting heart rate, against your personal baseline."}
              </p>
            </>
          ) : (
            <EmptyState icon={HeartPulse} title="No recovery score" body="Recovery needs HRV or a provider-native recovery score from a connected wearable." />
          )}
        </Section>

        <Section title="Stress" subtitle="Against your own baseline, not a population norm." icon={Brain}>
          {stress !== null ? (
            <>
              <Meter value={100 - stress} label={stress >= 60 ? "Elevated" : stress >= 40 ? "Moderate" : "Low"} ariaLabel="Stress level, inverted so higher is calmer" />
              <p className="mt-3 text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                Shown inverted so a fuller bar always means better, the same as every other meter here. Your raw stress
                reading is {stress}.
              </p>
            </>
          ) : (
            <EmptyState
              icon={Brain}
              title="No stress reading"
              body="Stress scoring needs heart rate variability plus at least five days of history. HRV comes from Apple Health today."
            />
          )}
        </Section>
      </div>

      <div className="lux-stagger-3">
        <Section title="What to do" subtitle="Small, unglamorous, and effective.">
          <div className="grid gap-3 sm:grid-cols-2">
            {RECOVERY_ACTIONS.map((action) => {
              const Icon = action.icon;
              const inner = (
                <>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" }}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                      {action.label}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                      {action.body}
                    </span>
                  </span>
                </>
              );
              const className = "flex items-start gap-3 rounded-[18px] p-4";
              const style = { background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" };

              return "href" in action && action.href ? (
                <Link key={action.label} href={action.href} className={className} style={style}>
                  {inner}
                </Link>
              ) : (
                <div key={action.label} className={className} style={style}>
                  {inner}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="lux-stagger-4">
        <Section
          title="What works for you"
          subtitle={memory ? `From your own history over the last ${memory.windowDays} days.` : undefined}
          icon={Brain}
        >
          {memory && memory.findings.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {memory.findings.slice(0, 4).map((finding) => {
                const good = finding.meanDelta > 0;
                const color = good ? toneColor("positive") : toneColor("critical");
                return (
                  <li key={finding.label} className="flex items-start gap-3">
                    <span
                      className="tabular mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: `${color}1f`, color }}
                    >
                      {good ? "+" : ""}
                      {finding.meanDelta}
                    </span>
                    <span className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                      {finding.sentence}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Brain}
              title="Still learning"
              body="MoodSync needs at least three of the same kind of session — meditations, focus sessions, scene runs — with recovery readings either side before it will claim something works for you."
            />
          )}

          {memory && memory.bestFocusHours.length > 0 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--lux-hairline)" }}>
              <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
                Your best focus hours
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {memory.bestFocusHours.slice(0, 4).map((hour) => (
                  <span
                    key={hour.hourOfDay}
                    className="rounded-full px-3 py-1.5 text-[12.5px]"
                    style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
                  >
                    <span className="tabular font-medium">
                      {hour.hourOfDay.toString().padStart(2, "0")}:00
                    </span>
                    <span style={{ color: "var(--lux-muted)" }}> · {hour.meanScore} avg</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
                From the focus scores of sessions you actually completed.
              </p>
            </div>
          )}
        </Section>
      </div>

      <div className="lux-stagger-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Sleep" value={brief?.scores?.sleep.value?.toString() ?? "—"} />
        <Stat label="Readiness" value={brief?.readiness.value?.toString() ?? "—"} />
        <Stat label="Energy now" value={brief?.energy?.toString() ?? "—"} />
      </div>
    </div>
  );
}
