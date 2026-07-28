function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** A coefficient-of-variation (CV) of 0.03 (3%) or less maps to a
 * perfect 100 — a steady heart rate throughout a focus session. A CV of
 * 0.15 (15%) or more maps to 0 — heart rate swinging widely, consistent
 * with getting up, moving around, or an emotionally reactive
 * distraction. These two anchors are a heuristic calibration, not a
 * published clinical threshold — no accepted clinical formula maps HR
 * variability-during-a-task to "focus" the way it does for HRV-based
 * stress/recovery scoring. See docs/FOCUS_SESSIONS.md. */
const CV_FOR_PERFECT_SCORE = 0.03;
const CV_FOR_ZERO_SCORE = 0.15;

/**
 * Focus Session score (0-100) — a **heuristic**, computed from how
 * *stable* heart rate was during the session window, not from any
 * distraction-detection signal (no such signal exists in this app —
 * see FocusSession's schema comment). Lower heart-rate variability
 * during a focus session is treated as a proxy for sustained, steady
 * engagement; this is explicitly a proxy, not a measurement of
 * attention. Requires at least 3 heart rate samples in the window to
 * be meaningful; returns `null` otherwise, consistent with every other
 * score in this app never guessing from insufficient data.
 */
export function computeFocusSessionScore(heartRateSamples: number[]): number | null {
  if (heartRateSamples.length < 3) return null;

  const m = mean(heartRateSamples);
  if (m === 0) return null;
  const cv = stdev(heartRateSamples, m) / m;

  const normalized = (CV_FOR_ZERO_SCORE - cv) / (CV_FOR_ZERO_SCORE - CV_FOR_PERFECT_SCORE);
  return Math.round(clamp(normalized * 100, 0, 100));
}
