import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { HeartPulse, AlertTriangle, Footprints, Droplets, Wind, Clock, Brain, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, Section, Meter, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { DailyBriefResponse, WellnessMemoryResponse, RecoveryAction, RecoveryActionKind } from "@/lib/types";

const ACTION_ICON: Record<RecoveryActionKind, LucideIcon> = {
  walk: Footprints,
  breathing: Wind,
  hydrate: Droplets,
  stop_early: Clock,
};

/**
 * Recovery — what to do when the numbers say back off.
 *
 * The page is one column of decreasing urgency: burnout if it's firing,
 * then what to do, then where you stand, then what your own history
 * says. "What to do" sits above the meters on purpose — someone opening
 * this page has already been told their recovery is low; the useful
 * answer is the next action, not the number again.
 *
 * The actions are ranked server-side per request (ai/src/recoveryActions.ts)
 * rather than being a fixed list: which appear, in what order, and what
 * reason each carries all move with this user's own measured history
 * and their signals right now. Actions grounded in that measured
 * history are badged; heuristics are not, so the two never read as
 * equally proven.
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
  const actions = memory?.recoveryActions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Recovery" subtitle="Where you stand, and what actually helps you." />

      {brief?.burnout && (
        <section
          className="lux-stagger-1 flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "var(--terracotta-bg)", border: "1px solid var(--lux-rose)" }}
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

      {actions.length > 0 && (
        <div className="lux-stagger-2">
          <Section title="Do this next" subtitle="Ranked for your signals right now." icon={Sparkles}>
            <ul className="flex flex-col gap-2.5">
              {actions.map((action, i) => (
                <ActionRow key={action.kind} action={action} lead={i === 0} />
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="lux-stagger-3 grid gap-4 lg:grid-cols-2">
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
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/** One ranked action. The lead action is visually heavier — a ranked
 * list that renders every row identically hasn't communicated its
 * ranking. */
function ActionRow({ action, lead }: { action: RecoveryAction; lead: boolean }) {
  const Icon = ACTION_ICON[action.kind];

  const inner = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          background: lead ? "var(--lux-sage)" : "var(--lux-bg-card-2)",
          color: lead ? "#16211a" : "var(--lux-sage)",
        }}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
            {action.label}
          </span>
          {action.personalized && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--lux-gold)", background: "var(--gold-bg)" }}
            >
              Proven for you
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
          {action.reason}
        </span>
      </span>
    </>
  );

  const className = "flex items-start gap-3 rounded-[18px] p-4";
  const style = {
    background: lead ? "var(--lux-bg-card-2)" : "transparent",
    border: `1px solid ${lead ? "var(--lux-hairline-gold)" : "var(--lux-hairline)"}`,
  };

  return (
    <li>
      {action.href ? (
        <Link href={action.href} className={`${className} transition-colors hover:bg-surface-hover`} style={style}>
          {inner}
        </Link>
      ) : (
        <div className={className} style={style}>
          {inner}
        </div>
      )}
    </li>
  );
}
