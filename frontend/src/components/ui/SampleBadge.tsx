/**
 * Marks a chart as drawn from sample data rather than the viewer's own
 * readings.
 *
 * This is not decoration. Everything in `lib/sampleData.ts` is invented,
 * and a wellness number a user might read as their own is the one thing
 * this app must never fake silently — so any surface falling back to
 * those fixtures renders this next to its heading.
 */
export function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{
        color: "var(--lux-gold)",
        background: "var(--gold-bg)",
        border: "1px solid var(--lux-hairline-gold)",
      }}
    >
      Sample data
    </span>
  );
}
