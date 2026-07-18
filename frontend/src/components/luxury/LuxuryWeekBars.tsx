import type { NormalizedBiometricReading } from "@moodsync/shared";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** One bar per real day with a reading, sized by that day's recovery
 * score (0-100) — the closest real per-day metric to the Superdesign
 * draft's "Mood Pattern" bars, which had no real backing metric. Reuses
 * the same `history` array WellnessTimeline.tsx already fetches, just
 * collapsed to the latest reading per calendar day instead of every
 * reading. Days with no reading render an empty track rather than a
 * fabricated value. */
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
                  background: isPeak ? "var(--lux-sage)" : "var(--lux-bg-card-2)",
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
