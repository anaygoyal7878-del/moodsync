export interface BusyBlock {
  start: Date;
  end: Date;
}

export interface StudyWindowSuggestion {
  start: Date;
  end: Date;
  reason: string;
}

/** Longest free stretch is capped at this many minutes when suggesting a
 * window — a genuinely free 5-hour afternoon still gets a focused
 * 2-hour suggestion, not "study for 5 hours straight." */
const MAX_SUGGESTED_MINUTES = 120;
const MIN_USABLE_BLOCK_MINUTES = 45;

function energyDescriptor(energyValue: number | null): string {
  if (energyValue === null) return '';
  if (energyValue >= 70) return ' Your energy is high right now — a good time for deep focus.';
  if (energyValue >= 40) return ' Your energy is moderate — a solid window for steady work.';
  return " Your energy is low — consider a lighter task, or a short break first.";
}

/** Inverts a list of busy calendar blocks (already sorted or not) into
 * the free gaps within [dayStart, dayEnd] — a simple sweep, not
 * anything calendar-API-specific. Overlapping/adjacent busy blocks are
 * merged first so a back-to-back meeting run doesn't produce spurious
 * zero-length "free" gaps between them. */
export function computeFreeBlocks(busy: BusyBlock[], dayStart: Date, dayEnd: Date): BusyBlock[] {
  const sorted = [...busy]
    .map((b) => ({ start: new Date(Math.max(b.start.getTime(), dayStart.getTime())), end: new Date(Math.min(b.end.getTime(), dayEnd.getTime())) }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyBlock[] = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) {
      last.end = new Date(Math.max(last.end.getTime(), block.end.getTime()));
    } else {
      merged.push({ ...block });
    }
  }

  const free: BusyBlock[] = [];
  let cursor = dayStart;
  for (const block of merged) {
    if (block.start > cursor) free.push({ start: cursor, end: block.start });
    cursor = block.end > cursor ? block.end : cursor;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
}

/**
 * Adaptive Study Planner — picks the single longest free calendar block
 * today (at least `MIN_USABLE_BLOCK_MINUTES` long) and suggests a
 * focused window within it, capped at `MAX_SUGGESTED_MINUTES`. Energy
 * only changes the *reasoning text* shown, not which block gets picked
 * — there's no evidence base for "energy score X means block Y is
 * better than block Z," so this stays honest about what's actually
 * driving the choice (free time), with energy as color commentary, not
 * the ranking signal.
 */
export function computeStudyWindowSuggestion(freeBlocks: BusyBlock[], energyValue: number | null): StudyWindowSuggestion | null {
  const usable = freeBlocks.filter((b) => (b.end.getTime() - b.start.getTime()) / 60_000 >= MIN_USABLE_BLOCK_MINUTES);
  if (usable.length === 0) return null;

  const longest = usable.reduce((best, block) => (block.end.getTime() - block.start.getTime() > best.end.getTime() - best.start.getTime() ? block : best));

  const blockMinutes = (longest.end.getTime() - longest.start.getTime()) / 60_000;
  const suggestedMinutes = Math.min(blockMinutes, MAX_SUGGESTED_MINUTES);
  const suggestedEnd = new Date(longest.start.getTime() + suggestedMinutes * 60_000);

  return {
    start: longest.start,
    end: suggestedEnd,
    reason: `Your longest free stretch today.${energyDescriptor(energyValue)}`,
  };
}
