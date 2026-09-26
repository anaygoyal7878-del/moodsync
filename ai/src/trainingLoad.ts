/**
 * Training load from logged workouts — the "recent exercise load" input
 * the Recovery engine was designed to weigh and could not, because
 * nothing recorded intensity until workouts gained perceived effort.
 *
 * ## Method
 *
 * Session load is duration × perceived effort (the session-RPE approach
 * used widely in sport science), computed only from sessions where the
 * person actually rated effort. A session without a rating contributes
 * no load rather than an assumed one: an easy walk and an interval set
 * of equal length differ several-fold, and guessing which one it was
 * would put invented numbers into a recovery judgement.
 *
 * Effort here is MoodSync's 1–5 scale rather than the 0–10 scale the
 * method was built on. That changes the units of load, not the
 * comparison — and every comparison below is against the person's own
 * history on the same scale, so the absolute units never matter.
 *
 * ## What this does and does not claim
 *
 * It compares the last seven days with the person's own typical week,
 * and reports "higher than usual" as recovery context. It does not
 * predict injury. Ratio-based injury prediction (the acute:chronic
 * workload ratio) has been seriously criticised on statistical grounds,
 * so this uses the comparison only for what it can support — that the
 * body has recently been asked for more than it usually is.
 */

export interface LoggedSession {
  completedAt: Date;
  minutes: number | null;
  /** 1–5, or null when the person skipped rating it. */
  effort: number | null;
}

export interface TrainingLoadSummary {
  /** Load over the last 7 days, from rated sessions only. */
  acuteLoad: number;
  /** Average weekly load across the prior 3 weeks. Null until there are
   * enough rated weeks to call it typical. */
  typicalWeeklyLoad: number | null;
  /** acute ÷ typical. Null when typical is unknown. */
  ratio: number | null;
  /** Rated sessions in the last 7 days — surfaced so "load is high" is
   * never read without knowing it rests on two sessions. */
  ratedSessionsThisWeek: number;
  /** Sessions this week with no effort rating, which contributed nothing. */
  unratedSessionsThisWeek: number;
}

const DAY_MS = 86_400_000;
/** Weeks of history behind "typical", beyond the current week. */
const TYPICAL_WEEKS = 3;
/** A typical week needs rated sessions in at least this many of the
 * prior weeks; one week of history is a single sample, not a norm. */
const MIN_WEEKS_WITH_DATA = 2;

export function sessionLoad(session: LoggedSession): number | null {
  if (session.minutes === null || session.effort === null) return null;
  if (session.minutes <= 0 || session.effort < 1 || session.effort > 5) return null;
  return session.minutes * session.effort;
}

export function summarizeTrainingLoad(sessions: LoggedSession[], now: Date = new Date()): TrainingLoadSummary {
  const weekStart = now.getTime() - 7 * DAY_MS;

  let acuteLoad = 0;
  let ratedSessionsThisWeek = 0;
  let unratedSessionsThisWeek = 0;
  const priorWeeks = Array.from({ length: TYPICAL_WEEKS }, () => ({ load: 0, rated: 0 }));

  for (const session of sessions) {
    const at = session.completedAt.getTime();
    if (at > now.getTime()) continue;
    const load = sessionLoad(session);

    if (at >= weekStart) {
      if (load === null) unratedSessionsThisWeek++;
      else {
        acuteLoad += load;
        ratedSessionsThisWeek++;
      }
      continue;
    }

    // Which prior week (0 = the week before this one).
    const weekIndex = Math.floor((weekStart - at) / (7 * DAY_MS));
    if (weekIndex >= TYPICAL_WEEKS || load === null) continue;
    priorWeeks[weekIndex]!.load += load;
    priorWeeks[weekIndex]!.rated++;
  }

  const weeksWithData = priorWeeks.filter((w) => w.rated > 0);
  // Averaged over every prior week in the window, including empty ones —
  // a rest week is part of what "typical" means, and dropping it would
  // inflate the norm and make every normal week look light.
  const typicalWeeklyLoad =
    weeksWithData.length >= MIN_WEEKS_WITH_DATA
      ? priorWeeks.reduce((sum, w) => sum + w.load, 0) / TYPICAL_WEEKS
      : null;

  return {
    acuteLoad,
    typicalWeeklyLoad,
    ratio: typicalWeeklyLoad && typicalWeeklyLoad > 0 ? Math.round((acuteLoad / typicalWeeklyLoad) * 100) / 100 : null,
    ratedSessionsThisWeek,
    unratedSessionsThisWeek,
  };
}
