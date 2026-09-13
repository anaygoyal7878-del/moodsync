import { biometricReadingRepository, environmentRepository, userTimezoneRepository } from '@moodsync/database';
import { hourInZone } from '@moodsync/shared';
import {
  assessState,
  recommendScent,
  inferCalendarOccasion,
  applicationTiming,
  getOccasionEvents,
  OCCASION_LABELS,
  ALL_SCENTS,
  APPLICATION_RULES,
  NOTE_TIMING,
  type OccasionBasis,
} from '@moodsync/ai';

/**
 * The Fragrance page's one read.
 *
 * Deliberately its own service rather than another field on the
 * Adaptive Environment snapshot. That snapshot answers "what should the
 * room do", gathers lights, scenes, music and temperature to do it, and
 * carries the scent suggestion as one line inside a proposal. A page
 * about what to wear needs none of that, and does need things the
 * proposal has no room for: the calendar reasoning behind the occasion,
 * the next event itself, and the rest of the collection to compare
 * against. Pulling that through the environment proposal would have
 * meant widening a type about rooms to carry fragrance browsing.
 *
 * How far ahead to look for the event worth dressing for. Long enough to
 * catch tonight from the morning, short enough that "what should I wear"
 * is never answered against tomorrow.
 */
const LOOKAHEAD_HOURS = 18;

export interface ScentBriefing {
  /** The user's own toggle. False means the whole feature is off and the
   * page should say so rather than rendering an empty state that looks
   * like a failure. */
  enabled: boolean;
  recommendation: {
    name: string;
    tagline: string;
    description: string;
    /** Null when the brand publishes no pyramid for this fragrance —
     * see scentLibrary.ts. Never an empty array, which would read as
     * "this fragrance has no notes". */
    notes: { top: string[]; heart: string[]; base: string[] } | null;
    notesPublished: boolean;
    reasons: string[];
    pulsePoints: Array<{ where: string; note: string }>;
    noteTiming: string;
    alternatives: Array<{ name: string; tagline: string }>;
  } | null;
  calendar: {
    /** False when no calendar is reachable — distinct from a connected
     * calendar with nothing on it. The page says different things for
     * those two, and conflating them would tell someone to connect a
     * calendar they already connected. */
    connected: boolean;
    occasionLabel: string;
    basis: OccasionBasis;
    reason: string;
    nextEvent: { startsAt: string; endsAt: string; durationMinutes: number } | null;
    applicationTiming: { headline: string; detail: string } | null;
  };
  /** The whole catalog, so the page can show what wasn't picked without
   * a second request. */
  collection: Array<{
    name: string;
    tagline: string;
    description: string;
    notes: { top: string[]; heart: string[]; base: string[] } | null;
  }>;
  /** The brand's own application guidance and note bands, so the page
   * can teach without inventing rules. */
  guidance: { rules: string[]; topMinutes: number; heartHours: number; baseLabel: string };
}

/**
 * Drops reasons that restate something the briefing already returns as
 * its own field.
 *
 * `recommendScent` composes `reasons` for a caller that renders one
 * paragraph — the Adaptive Environment card joins them into a single
 * sentence, where repeating the fragrance's description is useful
 * context. This payload returns `description` and `notes` as separate
 * fields, so the same reasons arrive as visible duplication: the
 * Fragrance page was rendering "Smoky and magnetic. An unapologetic
 * scent…" as the description and again, verbatim, as a bullet directly
 * beneath it.
 *
 * Filtered here rather than in the page so the rule lives next to the
 * fields it is deduplicating against — a page that later stops showing
 * the pyramid would otherwise silently lose that reason with no
 * indication why.
 */
export function withoutEchoes(reasons: string[], description: string, hasNotes: boolean): string[] {
  return reasons.filter((reason) => {
    if (reason.includes(description)) return false;
    // "Opens with bergamot, lemon… settles into cedarwood…" is the note
    // pyramid in sentence form, which is redundant beside the real one.
    if (hasNotes && /^Opens with /i.test(reason)) return false;
    return true;
  });
}

export const scentService = {
  async getBriefing(userId: string, now: Date = new Date()): Promise<ScentBriefing> {
    const [timezone, settings, latest] = await Promise.all([
      userTimezoneRepository.getTimezone(userId),
      environmentRepository.getSettings(userId),
      biometricReadingRepository.findLatestNormalized(userId),
    ]);
    const localHour = hourInZone(now, timezone);
    const history = latest ? await biometricReadingRepository.listRecentNormalized(userId, 30) : [];

    // Same state engine the environment card and the messaging tool use,
    // so all three surfaces cannot disagree about what the signals say.
    const assessment = assessState(
      {
        latest: latest?.reading ?? null,
        history: history.filter((r) => r.timestamp !== latest?.reading.timestamp),
        localHour,
        bookedHoursToday: null,
        inFocusSession: false,
        minutesSinceWorkout: null,
        userDeclaredState: null,
      },
      now,
    );

    // A calendar outage costs the occasion, not the page.
    const events = await getOccasionEvents(
      userId,
      now,
      new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60_000),
      now,
    ).catch(() => null);

    const calendarOccasion = events ? inferCalendarOccasion(events, now, localHour) : null;
    const occasion = calendarOccasion && calendarOccasion.occasion !== 'unspecified' ? calendarOccasion.occasion : 'unspecified';
    const timing = calendarOccasion ? applicationTiming(calendarOccasion, now) : null;

    const rec = settings.scentEnabled
      ? recommendScent({ localHour, occasion, state: assessment.currentState, owned: [] })
      : null;

    return {
      enabled: settings.scentEnabled,
      recommendation: rec
        ? {
            name: rec.scent.name,
            tagline: rec.scent.tagline,
            description: rec.scent.description,
            notes: rec.scent.notes,
            notesPublished: rec.scent.notes !== null,
            reasons: withoutEchoes(rec.reasons, rec.scent.description, rec.scent.notes !== null),
            pulsePoints: rec.pulsePoints.map((p) => ({ where: p.label, note: p.note })),
            noteTiming: rec.timing,
            alternatives: rec.alternatives.map((a) => ({ name: a.scent.name, tagline: a.scent.tagline })),
          }
        : null,
      calendar: {
        connected: events !== null,
        occasionLabel: OCCASION_LABELS[occasion],
        basis: calendarOccasion?.basis ?? 'none',
        reason:
          calendarOccasion?.reason ??
          (events === null
            ? 'No calendar connected, so this is based on the time of day.'
            : 'Nothing on your calendar to go on, so this is based on the time of day.'),
        nextEvent: calendarOccasion?.event
          ? {
              startsAt: calendarOccasion.event.startsAt.toISOString(),
              endsAt: calendarOccasion.event.endsAt.toISOString(),
              durationMinutes: calendarOccasion.event.durationMinutes,
            }
          : null,
        applicationTiming: timing,
      },
      collection: ALL_SCENTS.map((s) => ({
        name: s.name,
        tagline: s.tagline,
        description: s.description,
        notes: s.notes,
      })),
      guidance: {
        rules: APPLICATION_RULES,
        topMinutes: NOTE_TIMING.topMinutes,
        heartHours: NOTE_TIMING.heartHours,
        baseLabel: NOTE_TIMING.baseLabel,
      },
    };
  },
};
