import { prisma } from '../prismaClient.js';
import type { Prisma } from '@prisma/client';

/** One event window, pushed from the iOS companion app's EventKit
 * reader. Deliberately no title/location/attendees — see the schema
 * comment on `AppleCalendarSnapshot` for why. */
export interface CalendarEventWindow {
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
}

/** Hard cap on events accepted per push. A normal "today" calendar is a
 * handful of events; three digits is already generous slack, and a cap
 * exists mainly so a malformed client (or a compromised session) can't
 * write an unbounded JSON blob. */
const MAX_EVENTS_PER_PUSH = 300;

export const appleCalendarSnapshotRepository = {
  /** Wholesale replace — a cache, not a log, same as `homeSnapshotRepository`. */
  async upsert(userId: string, events: CalendarEventWindow[]): Promise<void> {
    // CalendarEventWindow is plain string/boolean fields — a structurally
    // valid Prisma.InputJsonValue at runtime; the cast is only needed
    // because Prisma's generated Json type can't express "this specific
    // shape" the way our own interface does.
    const bounded = events.slice(0, MAX_EVENTS_PER_PUSH) as unknown as Prisma.InputJsonValue;
    await prisma.appleCalendarSnapshot.upsert({
      where: { userId },
      update: { eventsJson: bounded, pushedAt: new Date() },
      create: { userId, eventsJson: bounded },
    });
  },

  async getForUser(userId: string): Promise<{ events: CalendarEventWindow[]; pushedAt: Date } | null> {
    const row = await prisma.appleCalendarSnapshot.findUnique({ where: { userId } });
    if (!row) return null;
    return { events: row.eventsJson as unknown as CalendarEventWindow[], pushedAt: row.pushedAt };
  },
};
