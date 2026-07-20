import type { NormalizedBiometricReading } from "@moodsync/shared";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** One bar per real day with a reading, sized by that day's recovery
 * score (0-100) — the closest real per-day metric to the Superdesign
 * draft's "Mood Pattern" bars, which had no real backing metric. Reuses
 * the same `history` array WellnessTimeline.tsx already fetches, just
 * collapsed to the latest reading per calendar day instead of every
 * reading. Days with no reading render an empty track rather than a
 * fabricated value; when NO day in the window has one, the whole chart
 * is replaced by an explicit empty state rather than seven flat tracks
 * (which read as a broken chart, not as "no data yet"). */
export function LuxuryWeekBars({ history }: { history: NormalizedBiometricReading[] }) {
  const byDay = new Map<string, number>();
  for (const reading of history) {
    if (reading.recoveryScore === undefined) continue;
    const date = new Date(reading.timestamp);
    const key = date.toDateString();
    byDay.set(key, reading.recoveryScore);
  }

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const value = byDay.get(d.toDateString());
    return { label: DAY_LABELS[d.getDay()], value, isToday: i === 6 };
  });

  const maxValue = Math.max(...days.map((d) => d.value ?? 0), 1);
  const hasAnyValue = days.some((d) => d.value !== undefined);

  if (!hasAnyValue) {
    return (
      <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 text-center">
        <span className="text-[13px]" style={{ color: "var(--lux-ink)" }}>
          No recovery data yet
        </span>
        <span className="max-w-[240px] text-[11px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          Connect a wearable and your daily recovery scores will chart here.
        </span>
      </div>
    );
  }

  return (
    // items-stretch (not items-end) so each day column is a real 120px
    // box — a percentage height on the bar below only resolves against
    // an ancestor with a *definite* height, which a content-sized
    // flex-end-aligned column never has. The bar-area wrapper is itself
    // a flex-1 child of that stretched column (definite height =
    // 120px minus the label's row), then aligns the bar to its bottom
    // with items-end so short values still sit on the baseline.
    <div className="flex h-[120px] items-stretch gap-2.5">
      {days.map((day, i) => {
        const heightPct = day.value !== undefined ? Math.max((day.value / maxValue) * 100, 6) : 0;
        const isPeak = day.value !== undefined && day.value === maxValue;
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-[8px] rounded-b-[4px] transition-all"
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  // A day with a reading gets a translucent sage fill that
                  // deepens with the score, so the week's *shape* is legible
                  // at a glance; only the peak goes fully solid. Previously
                  // every non-peak bar was --lux-bg-card-2 — the card's own
                  // background — which made six of seven bars invisible.
                  // A day with no reading stays on that flat track colour,
                  // which is now the only thing that renders as "absent".
                  background:
                    day.value === undefined
                      ? "var(--lux-bg-card-2)"
                      : isPeak
                        ? "var(--lux-sage)"
                        : `rgba(95, 184, 120, ${0.28 + (day.value / maxValue) * 0.34})`,
                }}
              />
            </div>
            <span
              className="text-[11px]"
              style={{
                color: isPeak ? "var(--lux-sage)" : "var(--lux-muted)",
                fontWeight: isPeak ? 600 : 400,
              }}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
