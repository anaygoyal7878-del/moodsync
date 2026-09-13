import Link from "next/link";
import { ArrowRight, Sunrise, Moon, Sun, Sunset } from "lucide-react";
import { Metric, MetricRow, Reasons, toneForScore, toneColor } from "./CompanionPrimitives";
import type { DailyBriefResponse } from "@/lib/types";

const TIME_ICON = { morning: Sunrise, afternoon: Sun, evening: Sunset, night: Moon } as const;

const READINESS_LABEL = { primed: "Primed", steady: "Steady", depleted: "Depleted" } as const;

function bandFor(value: number): keyof typeof READINESS_LABEL {
  if (value >= 67) return "primed";
  if (value >= 40) return "steady";
  return "depleted";
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * The top of the home screen: who you are, what day it is, and the two
 * numbers that actually decide how to spend it.
 *
 * Readiness and Energy sit side by side deliberately — they answer
 * different questions (how much load can I take today vs. how much have
 * I got right now) and showing them together is the whole thesis of the
 * brief. Neither is invented: both come from
 * `GET /api/daily-brief`, and when there's no wearable data behind
 * them the hero says so instead of rendering two empty rings.
 */
export function DailyBriefHero({ brief }: { brief: DailyBriefResponse }) {
  const TimeIcon = TIME_ICON[brief.timeOfDay];
  const readiness = brief.readiness.value;
  const band = readiness === null ? null : bandFor(readiness);

  return (
    <section
      /* The product tour spotlights this element by name — see
         demo/tour/tourSteps.ts. It moved from the old overall-wellness
         hero to this one; the anchor comes with it so the tour keeps
         pointing at "the headline number" rather than degrading to a
         centred card. */
      data-tour="wellness-score"
      className="lux-stagger-1 relative overflow-hidden rounded-[26px] p-6"
      /* Warm charcoal into a trace of gold, replacing a purple gradient
         (#241a2c → #171220) that read as the generic "AI product" look
         rather than as this product's own palette — it also sat badly
         next to the sage and gold around it. Tokens now, so an app-wide
         retheme stays a token edit. */
      style={{
        background: "var(--grad-hero)",
        border: "1px solid var(--lux-hairline-gold)",
        boxShadow: "var(--elev-1)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--grad-gold-glow)" }}
        aria-hidden="true"
      />

      <div className="relative flex items-center gap-2">
        <TimeIcon size={15} style={{ color: "var(--lux-gold)" }} aria-hidden="true" />
        <span className="text-[12px] tracking-wide" style={{ color: "var(--lux-muted)" }}>
          {todayLabel()}
        </span>
      </div>

      <h1 className="font-luxury-display relative mt-1.5 text-[27px] font-semibold leading-tight" style={{ color: "var(--lux-ink)" }}>
        {brief.greeting}
      </h1>

      {!brief.hasData ? (
        <p className="relative mt-3 max-w-[46ch] text-[13.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          Connect a wearable and MoodSync will start reading your mornings — readiness, energy, and what actually changed
          overnight.{" "}
          <Link href="/dashboard/connections" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--lux-sage)" }}>
            Connect a device
          </Link>
        </p>
      ) : (
        <>
          {/* The headline figures lead, at display scale, before any
              bar. A number readable at a glance is what this screen
              exists to deliver; the meters below give it shape without
              competing for first look. Readiness carries the gold
              because it is the metric that answers "how am I today" —
              the accent stops meaning anything if all three wear it. */}
          <div className="relative mt-5">
            <MetricRow>
              <Metric
                value={readiness ?? "—"}
                label="Readiness"
                emphasis
                progress={readiness}
                {...(band ? { hint: READINESS_LABEL[band] } : {})}
              />
              <Metric value={brief.energy ?? "—"} label="Energy now" progress={brief.energy} />
              <Metric
                value={brief.scores?.recovery.value ?? "—"}
                label="Recovery"
                progress={brief.scores?.recovery.value ?? null}
              />
            </MetricRow>
          </div>

          <p className="relative mt-3 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
            Readiness is set by your night. Energy moves through the day.
          </p>
        </>
      )}
    </section>
  );
}

/** "What changed overnight" — only rendered when something actually
 * moved against the user's own baseline. Silence is the honest answer on
 * a typical night, and this app would rather say nothing than
 * manufacture a change. */
export function OvernightChanges({ brief }: { brief: DailyBriefResponse }) {
  if (!brief.hasData) return null;

  return (
    <section
      className="lux-stagger-2 rounded-[24px] p-5"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
        What changed overnight
      </h2>
      {brief.overnightChanges.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--lux-muted)" }}>
          Nothing moved much — last night looked like your usual night.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {brief.overnightChanges.map((change) => {
            const positive = change.delta > 0;
            const color = positive ? toneColor("positive") : toneColor("critical");
            return (
              <li key={change.metric} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular"
                  style={{ background: `${color}1f`, color }}
                >
                  {positive ? "+" : ""}
                  {change.delta}
                </span>
                <span className="text-[13px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                  {change.sentence}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Focus / avoid / do — the actionable half of the brief. Each action
 * links somewhere real; each carries the reason it was chosen. */
export function BriefGuidance({ brief }: { brief: DailyBriefResponse }) {
  if (!brief.brief) return null;
  const { focusToday, avoidToday, actions } = brief.brief;

  return (
    <section className="lux-stagger-3 flex flex-col gap-3">
      <div
        className="rounded-[24px] p-5"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
      >
        <p className="text-[11px] uppercase tracking-[0.07em]" style={{ color: "var(--lux-sage)" }}>
          Focus on today
        </p>
        <p className="mt-1.5 text-[15px] leading-snug" style={{ color: "var(--lux-ink)" }}>
          {focusToday}
        </p>

        {avoidToday && (
          <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--lux-hairline)" }}>
            <p className="text-[11px] uppercase tracking-[0.07em]" style={{ color: "var(--lux-rose)" }}>
              Go easy on
            </p>
            <p className="mt-1.5 text-[14px] leading-snug" style={{ color: "var(--lux-ink)" }}>
              {avoidToday}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {actions.map((action) => (
          <Link
            key={`${action.kind}-${action.label}`}
            href={action.href}
            className="group flex items-center justify-between gap-3 rounded-[20px] p-4 transition-colors"
            style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
                {action.label}
              </span>
              <span className="mt-0.5 block text-[12px]" style={{ color: "var(--lux-muted)" }}>
                {action.reason}
              </span>
            </span>
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--lux-sage)" }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Compact score row — the four wellness scores as a single glanceable
 * strip rather than four separate cards. */
export function ScoreStrip({ brief }: { brief: DailyBriefResponse }) {
  if (!brief.scores) return null;
  const entries = [
    { label: "Sleep", score: brief.scores.sleep.value },
    { label: "Recovery", score: brief.scores.recovery.value },
    { label: "Stress", score: brief.scores.stress.value, invert: true },
    { label: "Focus", score: brief.scores.focus.value },
  ];

  return (
    <section
      className="lux-stagger-4 grid grid-cols-4 gap-1 rounded-[20px] p-3"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      {entries.map((entry) => {
        const color =
          entry.score === null
            ? "var(--lux-muted)"
            : toneColor(toneForScore(entry.invert ? 100 - entry.score : entry.score));
        return (
          <div key={entry.label} className="px-1 text-center">
            <p className="font-luxury-display tabular text-[19px] font-semibold" style={{ color }}>
              {entry.score ?? "—"}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.05em]" style={{ color: "var(--lux-muted)" }}>
              {entry.label}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export { Reasons };
