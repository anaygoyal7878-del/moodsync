import type { Occasion } from './scentIntelligence.js';
import { NOTE_TIMING } from './scentLibrary.js';

/**
 * Reads a day's calendar and works out what the next thing on it *is*,
 * so a fragrance suggestion can be about the evening ahead rather than
 * about the hour on the clock.
 *
 * Before this, `inferOccasion` in environmentService.ts was two lines:
 * in a meeting meant `work`, and everything else meant `unspecified`.
 * That left the scent engine's whole `Occasion` axis — date, formal
 * event, workout, travel — permanently unreachable, deciding on time of
 * day alone.
 *
 * ## The asymmetry between the two calendar sources, and why it stays
 *
 * The two sources do not carry the same information, and this module
 * deliberately does not paper over the difference:
 *
 * - **Google Calendar** returns event titles. A title is the single
 *   most informative signal available — "Dinner with Mara" and
 *   "Sprint planning" are the same shape on a calendar grid and
 *   completely different evenings.
 * - **Apple Calendar** stores start, end and all-day, and nothing else.
 *   That is a deliberate privacy decision recorded on the
 *   `AppleCalendarSnapshot` schema model, not an oversight or a gap
 *   waiting to be filled. Fixing this module by starting to store iOS
 *   event titles would be trading a documented privacy property for a
 *   cologne suggestion, which is not a trade worth making.
 *
 * So there are two classifiers. The title one runs when a title exists;
 * the structural one runs on shape alone and is what an Apple-only user
 * gets. Every result carries `basis` saying which ran, because the two
 * do not deserve equal confidence and the UI should not present them as
 * though they do.
 *
 * ## What the structural classifier will not guess
 *
 * It infers `work` and `casual_outing` and stops. It will not call a
 * long evening block a `date`, because a two-hour 8pm event is equally
 * a dinner, a concert, a class, or a parent's birthday — and telling
 * someone "for your date tonight" about their mother's birthday is the
 * kind of confident wrongness that makes a person switch a feature off.
 * Where the shape is genuinely ambiguous it returns `unspecified` and
 * lets the scent engine fall back to time of day, which is honest.
 */

export interface OccasionEvent {
  start: Date;
  end: Date;
  isAllDay: boolean;
  /** Google Calendar only. Apple's snapshot stores no titles by design,
   * so this is absent for that source — not empty, absent. */
  title?: string | null | undefined;
}

export type OccasionBasis = 'title' | 'structure' | 'none';

export interface CalendarOccasion {
  occasion: Occasion;
  /** Which classifier produced this. `title` is a real signal;
   * `structure` is an educated guess from shape; `none` means nothing
   * on the calendar was close enough to reason about. */
  basis: OccasionBasis;
  /** Shown to the user. Says what it saw, never more than it saw. */
  reason: string;
  /** The event this was read from, when there was one. */
  event: { startsAt: Date; endsAt: Date; durationMinutes: number } | null;
}

/**
 * Title keywords, most specific category first.
 *
 * Word-boundary matched rather than substring matched, which is not
 * pedantry: "training" contains "train", so a substring match sends
 * every gym session to `travel`. Ordering matters too — "dinner party"
 * should read as social rather than tripping a formal keyword.
 */
const TITLE_PATTERNS: Array<{ occasion: Occasion; label: string; words: RegExp }> = [
  {
    occasion: 'formal_event',
    label: 'a formal event',
    words: /\b(wedding|gala|ceremony|funeral|memorial|black[- ]tie|banquet|graduation|interview|awards?)\b/i,
  },
  {
    occasion: 'workout',
    label: 'a workout',
    words: /\b(gym|workout|training|lift|run|running|ride|cycling|yoga|pilates|swim|climb|practice|match|bootcamp)\b/i,
  },
  {
    occasion: 'travel',
    label: 'travel',
    words: /\b(flight|airport|depart|departure|boarding|train|amtrak|road ?trip|check[- ]?in|layover)\b/i,
  },
  {
    occasion: 'date',
    label: 'a date',
    words: /\b(date|dinner|drinks|anniversary|valentine|cocktails|brunch with)\b/i,
  },
  {
    occasion: 'work',
    label: 'work',
    words: /\b(meeting|standup|stand[- ]up|sync|1:1|one[- ]on[- ]one|review|retro|planning|call|interview prep|client|demo|workshop|offsite)\b/i,
  },
  {
    occasion: 'casual_outing',
    label: 'a casual outing',
    words: /\b(coffee|lunch|party|birthday|hangout|catch[- ]?up|game night|movie|concert|show)\b/i,
  },
];

/** Business hours, used only by the structural classifier. */
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
/** An evening event shorter than this reads as an errand, not an
 * outing worth dressing for. */
const OUTING_MIN_MINUTES = 60;

function durationMinutes(event: OccasionEvent): number {
  return Math.max(0, Math.round((event.end.getTime() - event.start.getTime()) / 60_000));
}

function classifyByTitle(title: string): { occasion: Occasion; label: string } | null {
  for (const pattern of TITLE_PATTERNS) {
    if (pattern.words.test(title)) return { occasion: pattern.occasion, label: pattern.label };
  }
  return null;
}

/**
 * Shape-only classification, for events with no title available.
 *
 * `localHour` is passed in rather than read off the Date, because the
 * Date is an instant and "is this an evening event" is a question about
 * the user's timezone, not the server's.
 */
function classifyByStructure(event: OccasionEvent, localHour: number): { occasion: Occasion; label: string } | null {
  if (event.isAllDay) return null;
  const minutes = durationMinutes(event);

  if (localHour >= WORK_START_HOUR && localHour < WORK_END_HOUR) {
    return { occasion: 'work', label: 'something scheduled during your working hours' };
  }
  if (localHour >= WORK_END_HOUR && minutes >= OUTING_MIN_MINUTES) {
    return { occasion: 'casual_outing', label: 'a longer evening event' };
  }
  return null;
}

/**
 * Picks the event worth dressing for and names the occasion.
 *
 * "Next, or currently running" rather than "the biggest thing today":
  * someone asking what to wear at 5pm cares about the 7pm dinner, not
 * the 9am standup that already happened. Events that have finished are
 * dropped entirely.
 */
export function inferCalendarOccasion(
  events: OccasionEvent[],
  now: Date,
  localHour: number,
  /** Hour offset from `now` to `localHour`, so an event later today can
   * be given its own local hour without a second timezone lookup. */
  utcOffsetHours = localHour - now.getUTCHours(),
): CalendarOccasion {
  const upcoming = events
    .filter((e) => e.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const event of upcoming) {
    const eventLocalHour = (((event.start.getUTCHours() + utcOffsetHours) % 24) + 24) % 24;

    const byTitle = event.title ? classifyByTitle(event.title) : null;
    if (byTitle) {
      return {
        occasion: byTitle.occasion,
        basis: 'title',
        reason: `Your calendar has "${event.title}" coming up, which reads as ${byTitle.label}.`,
        event: { startsAt: event.start, endsAt: event.end, durationMinutes: durationMinutes(event) },
      };
    }

    const byShape = classifyByStructure(event, eventLocalHour);
    if (byShape) {
      return {
        occasion: byShape.occasion,
        basis: 'structure',
        // Says "no title" out loud. An Apple-only user should understand
        // why this is vaguer than it could be, rather than assuming
        // MoodSync simply guessed badly.
        reason: `You have ${byShape.label} coming up. Your calendar source doesn't share event titles, so this is read from timing alone.`,
        event: { startsAt: event.start, endsAt: event.end, durationMinutes: durationMinutes(event) },
      };
    }
  }

  return {
    occasion: 'unspecified',
    basis: 'none',
    reason: 'Nothing on your calendar to go on, so this is based on the time of day.',
    event: null,
  };
}

/**
 * When to apply, so the fragrance is in the phase you want it in when
 * it matters.
 *
 * Built entirely on the note bands Nature's Note publishes — top 0-30
 * min, heart 30 min to 4 hrs, base 4 hrs on. Nothing here is invented
 * chemistry: it is arithmetic on the brand's own stated timings against
 * the start and length of a real event.
 *
 * The useful insight is that the *opening* is not what people at an
 * event smell. Apply on the way out the door and everyone meets the top
 * notes, which are gone in half an hour; apply half an hour earlier and
 * they meet the heart, which is what the fragrance actually is for the
 * next several hours.
 */
export function applicationTiming(
  occasion: CalendarOccasion,
  now: Date,
): { headline: string; detail: string } | null {
  if (!occasion.event) return null;

  const minutesUntil = Math.round((occasion.event.startsAt.getTime() - now.getTime()) / 60_000);
  const lasts = occasion.event.durationMinutes;
  const longEvent = lasts >= NOTE_TIMING.heartHours * 60;

  if (minutesUntil <= 0) {
    return {
      headline: 'Already started',
      detail: longEvent
        ? `This one runs ${Math.round(lasts / 60)} hours, so the base notes are what carry the back half of it. A light reapply now still lands before the end.`
        : 'Applying now means the top notes lead, which is the brightest the fragrance gets.',
    };
  }

  if (minutesUntil <= NOTE_TIMING.topMinutes) {
    return {
      headline: `Apply now — ${minutesUntil} min out`,
      detail: `You'd arrive inside the ${NOTE_TIMING.topMinutes}-minute top-note window, so people meet the bright opening. Applying is better slightly early than late.`,
    };
  }

  if (minutesUntil <= NOTE_TIMING.heartHours * 60) {
    return {
      headline: `Apply about ${NOTE_TIMING.topMinutes} minutes before you leave`,
      detail: `Your event starts in ${minutesUntil >= 120 ? `${Math.round(minutesUntil / 60)} hours` : `${minutesUntil} minutes`}. Applying then puts you in the heart notes on arrival — the part that lasts through to the ${NOTE_TIMING.baseLabel} base, rather than an opening that has already burned off.`,
    };
  }

  return {
    headline: 'Too early to apply',
    detail: `That's more than ${NOTE_TIMING.heartHours} hours out, which is past the heart-note window — applying now would leave only the base by the time you arrive. Worth doing closer to the time.`,
  };
}
