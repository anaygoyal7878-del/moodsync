import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The shared vocabulary every companion surface (Today, Energy, Sleep,
 * Recovery, Habits) is built from. These exist so the new pages are one
 * design system rather than five more variations on "a card" — the
 * problem the redesign brief called out by name.
 *
 * They use the `--lux-*` token set directly (rather than the ui/ Card
 * primitive's Tailwind classes) because every dashboard surface was
 * already migrated to that palette; mixing the two is what makes an app
 * look assembled rather than designed.
 */

/** Semantic tone → token. Kept here so "good/warning/bad" is decided in
 * one place and every meter, badge and stat agrees on what green means. */
export type Tone = "positive" | "neutral" | "caution" | "critical";

export function toneColor(tone: Tone): string {
  switch (tone) {
    case "positive":
      return "var(--lux-sage)";
    case "neutral":
      return "var(--lux-gold)";
    case "caution":
      return "#e0b34a";
    case "critical":
      return "var(--lux-rose)";
  }
}

/** 0-100 score → tone, the single banding rule for the whole app. */
export function toneForScore(value: number): Tone {
  if (value >= 67) return "positive";
  if (value >= 40) return "neutral";
  return "critical";
}

export function Section({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] p-5 ${className}`}
      style={{
        background: "var(--lux-bg-card)",
        border: "1px solid var(--lux-hairline)",
        // A one-pixel lit top edge plus a soft ambient drop. Together
        // these are what make a card read as a raised material rather
        // than a filled rectangle — the single cheapest premium cue on
        // a dark UI, and it costs no extra element.
        boxShadow: "inset 0 1px 0 var(--lux-edge-light), var(--shadow-md)",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={16} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />}
            <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {title}
            </h2>
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--lux-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** The battery-style meter used for energy, readiness and social
 * battery. One implementation so the three read as the same family of
 * measurement rather than three unrelated widgets. */
export function Meter({
  value,
  tone,
  label,
  ariaLabel,
}: {
  value: number | null;
  tone?: Tone;
  label?: string;
  ariaLabel: string;
}) {
  const resolvedTone = tone ?? (value === null ? "neutral" : toneForScore(value));
  const color = value === null ? "var(--lux-muted)" : toneColor(resolvedTone);

  return (
    <div>
      {/* Wraps rather than overflowing: in the home hero these sit two to
          a row, which is ~150px each at 375px — not enough for a 34px
          number and a status word side by side. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="font-luxury-display tabular text-[34px] font-semibold leading-none" style={{ color: "var(--lux-ink)" }}>
          {value === null ? "—" : value}
          {value !== null && (
            <span className="ml-0.5 text-[15px] font-normal" style={{ color: "var(--lux-muted)" }}>
              /100
            </span>
          )}
        </span>
        {label && (
          <span className="text-[12px] font-medium" style={{ color }}>
            {label}
          </span>
        )}
      </div>
      <div
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--lux-bg-card-2)" }}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${value ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

/** Every number in this app is supposed to come with its reason. This is
 * that list — the component exists so "show the why" is the path of
 * least resistance rather than something each page remembers to do. */
export function Reasons({ items, className = "" }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--lux-sage)" }} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Calm, specific empty state — names what's missing and what to do
 * about it, never a shrug. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-muted)" }}
      >
        <Icon size={19} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
          {title}
        </p>
        <p className="mx-auto mt-1 max-w-[36ch] text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}

/** Small labelled figure, for the secondary numbers that sit under a
 * primary meter. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
        {label}
      </p>
      <p className="font-luxury-display tabular mt-0.5 text-[19px] font-semibold" style={{ color: "var(--lux-ink)" }}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Marks a surface as an AI interpretation rather than a measurement.
 * Used wherever the underlying number is inferred (Social Battery,
 * readiness, wellness-memory findings) — the brief's "clearly labeled if
 * AI-generated" rule, made a component so it's consistent. */
export function AiEstimateNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-3 rounded-xl px-3 py-2 text-[11.5px] leading-relaxed"
      style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-muted)" }}
    >
      {children}
    </p>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="lux-stagger-1">
      <h1 className="font-luxury-display text-[26px] font-semibold leading-tight" style={{ color: "var(--lux-ink)" }}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[13px]" style={{ color: "var(--lux-muted)" }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}
