import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { HeartPulse, AlertTriangle, Footprints, Droplets, Wind, Clock, Brain, Sparkles, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, Section, Meter, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { DailyBriefResponse, WellnessMemoryResponse, RecoveryAction, RecoveryActionKind, HealthScenario, RecommendationEntry } from "@/lib/types";
import { RecommendationsSection } from "@/components/dashboard/RecommendationsSection";
import { RecoveryIntelligence } from "@/components/dashboard/recovery/RecoveryIntelligence";

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
/**
 * One researched finding.
 *
 * Three things are always visible and none of them are optional: what
 * was measured (`finding`, which carries the user's real numbers), what
 * to consider doing (`guidance`), and where the threshold came from
 * (`basis`). The basis is the part that would be easiest to bury in a
 * tooltip and the most important to keep in the open — a claim about
 * someone's body that they cannot check is one they can only take on
 * faith, and this whole feature exists to avoid that.
 *
 * "caution" gets the warmer colour and an icon; "notice" stays visually
 * quiet. The gap between them should be obvious at a glance, because
 * someone scrolling past should be able to tell the difference between
 * "two signals at once" and "your sleep score dipped".
 */
function ScenarioCard({ scenario }: { scenario: HealthScenario }) {
  const caution = scenario.severity === "caution";
  const accent = caution ? "var(--lux-gold)" : "var(--lux-muted)";
  const Icon = caution ? AlertTriangle : Activity;

  return (
    <section
      className="flex items-start gap-3 rounded-[20px] p-4"
      style={{
        background: "var(--lux-bg-card)",
        border: `1px solid ${caution ? "var(--lux-hairline-gold)" : "var(--lux-hairline)"}`,
      }}
    >
      <Icon size={17} style={{ color: accent }} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex flex-col gap-1.5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          {scenario.title}
        </p>
        <p className="text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
          {scenario.finding}
        </p>
        <p className="text-[13px] leading-snug" style={{ color: "var(--lux-ink)" }}>
          {scenario.guidance}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          {scenario.basis} Based on {scenario.sampleSize} of your readings — a signal to consider, not a diagnosis.
        </p>
      </div>
    </section>
  );
}

export default async function RecoveryPage() {
  const [briefResult, memoryResult, recommendationsResult] = await Promise.all([
    backendFetch<DailyBriefResponse>("/api/daily-brief"),
    backendFetch<WellnessMemoryResponse>("/api/wellness-memory"),
    backendFetch<{ recommendations: RecommendationEntry[] }>("/api/recommendations"),
  ]);
  const recommendations = recommendationsResult.ok ? recommendationsResult.data.recommendations : [];

  const brief = briefResult.ok ? briefResult.data : null;
  const memory = memoryResult.ok ? memoryResult.data : null;
  const recovery = brief?.scores?.recovery.value ?? null;
  const stress = brief?.scores?.stress.value ?? null;
  const actions = memory?.recoveryActions ?? [];
  // Only `caution` scenarios render here. A `notice` — HRV one SD below
  // baseline, sleep quality one SD below — uses the same threshold on
  // the same data as the Recovery Intelligence signal rows above, so
  // showing both put the same finding on screen twice (609px of it at
  // phone width). A caution is different in kind: it is the combination
  // of signals, which the per-signal table does not express.
  const scenarios = (memory?.healthScenarios ?? []).filter((scenario) => scenario.severity === "caution");
  const recoveryContext = memory?.recoveryContext ?? null;
  const evidence = memory?.evidence ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Recovery" subtitle="Where you stand, what helps, and what to try." />

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

      {/* Leads the page: this is the multi-signal read that explains
          itself, and everything below it is either an action derived
          from the same signals or supporting detail. */}
      {recoveryContext && (
        <div className="lux-stagger-1">
          <RecoveryIntelligence context={recoveryContext} evidence={evidence} />
        </div>
      )}

      {/* Above "Do this next" on purpose: these say what the body is
          showing, which is the thing that makes the actions below make
          sense. Rendered only when something actually applies — an
          "all clear" card every day would train people to skip this
          area entirely, and then to miss the day it says something. */}
      {scenarios.length > 0 && (
        <div className="lux-stagger-2 flex flex-col gap-2.5">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
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

      {/* Recommendations live here rather than in their own bottom-nav
          tab. The bar already carries six tabs and a seventh gets cramped
          at phone width, and these suggestions answer the same question
          as "Do this next" above — what would help — just on a longer
          horizon: routines to set up rather than things to do now. The
          standalone /dashboard/recommendations page still exists, so no
          saved link breaks. */}
      <div className="lux-stagger-4">
        <RecommendationsSection recommendations={recommendations} />
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
