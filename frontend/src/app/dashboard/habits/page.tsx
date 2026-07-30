import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { Repeat, Footprints, Sparkle, Timer, Flame } from "lucide-react";
import { PageHeader, Section, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { HabitsResponse, HabitStreakEntry } from "@/lib/types";

const HABIT_META: Record<
  HabitStreakEntry["habit"],
  { label: string; icon: typeof Repeat; basis: string; href?: string }
> = {
  walking: {
    label: "Walking",
    icon: Footprints,
    basis: "A day counts at 8,000 steps, read from your wearable.",
  },
  meditation: {
    label: "Meditation",
    icon: Sparkle,
    basis: "A day counts when you complete a session in MoodSync.",
    href: "/dashboard/meditation",
  },
  focus: {
    label: "Focus",
    icon: Timer,
    basis: "A day counts when you finish a focus session.",
    href: "/dashboard/focus",
  },
};

/**
 * The habits MoodSync deliberately does NOT track, and why. Shown in the
 * UI rather than buried in a doc, because a habit tracker that silently
 * omits hydration looks broken, whereas one that says "we won't guess at
 * this" reads as trustworthy — and it sets an honest expectation about
 * what a wearable can and can't see.
 */
const NOT_TRACKED = [
  { label: "Hydration", why: "No device reports it and MoodSync has no manual log for it yet." },
  { label: "Stretching", why: "Indistinguishable from other low-intensity movement in the data." },
  { label: "Screen time", why: "iOS keeps Screen Time data inside its own report extension — apps can't read the numbers." },
  { label: "Bedtime consistency", why: "Providers give a sleep score, not the time you fell asleep." },
];

function StreakRing({ days }: { days: number }) {
  const color = days === 0 ? "var(--lux-muted)" : toneColor(days >= 7 ? "positive" : "neutral");
  return (
    <div className="flex items-baseline gap-1.5">
      {days > 0 && <Flame size={15} style={{ color }} aria-hidden="true" />}
      <span className="font-luxury-display tabular text-[26px] font-semibold leading-none" style={{ color }}>
        {days}
      </span>
      <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
        day{days === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/**
 * Habits — streaks and consistency for the three habits that have a real
 * signal behind them, plus an explicit account of the ones that don't.
 */
export default async function HabitsPage() {
  const result = await backendFetch<HabitsResponse>("/api/habits");
  const habits = result.ok ? result.data.habits : [];
  const anyData = habits.some((h) => h.consistencyPct !== null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Habits" subtitle="The things that compound, and how consistent you've actually been." />

      {anyData ? (
        <div className="lux-stagger-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((habit) => {
            const meta = HABIT_META[habit.habit];
            const Icon = meta.icon;
            const consistency = habit.consistencyPct;

            const card = (
              <>
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
                  <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                    {meta.label}
                  </h2>
                </div>

                <div className="mt-3">
                  <StreakRing days={habit.currentStreakDays} />
                  <p className="mt-0.5 text-[11.5px] uppercase tracking-[0.05em]" style={{ color: "var(--lux-muted)" }}>
                    Current streak
                  </p>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
                      Last 30 days
                    </span>
                    <span className="tabular text-[13px] font-medium" style={{ color: "var(--lux-ink)" }}>
                      {consistency === null ? "—" : `${consistency}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--lux-bg-card-2)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${consistency ?? 0}%`,
                        background: consistency === null ? "var(--lux-muted)" : toneColor(consistency >= 60 ? "positive" : "neutral"),
                      }}
                    />
                  </div>
                </div>

                <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                  {meta.basis}
                </p>
              </>
            );

            const className = "rounded-[22px] p-5 transition-colors";
            const style = { background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" };

            return meta.href ? (
              <Link key={habit.habit} href={meta.href} className={`${className} hover:border-[color:var(--lux-sage)]`} style={style}>
                {card}
              </Link>
            ) : (
              <div key={habit.habit} className={className} style={style}>
                {card}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="lux-stagger-2">
          <Section title="Habits" icon={Repeat}>
            <EmptyState
              icon={Repeat}
              title="Nothing to track yet"
              body="Walking reads from a connected wearable's step count. Meditation and focus start counting the first time you complete a session."
              action={
                <Link
                  href="/dashboard/focus"
                  className="rounded-full px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--lux-sage)", color: "#1a241e" }}
                >
                  Start a focus session
                </Link>
              }
            />
          </Section>
        </div>
      )}

      <div className="lux-stagger-3">
        <Section
          title="Not tracked — and why"
          subtitle="MoodSync would rather leave a habit out than fake the data behind it."
        >
          <ul className="flex flex-col gap-3">
            {NOT_TRACKED.map((item) => (
              <li key={item.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <span className="w-40 shrink-0 text-[13.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
                  {item.label}
                </span>
                <span className="text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                  {item.why}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
