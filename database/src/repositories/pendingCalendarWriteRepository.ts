import { prisma } from '../prismaClient.js';

/** Bound on how far in the future a create may be requested, and how
 * long the event may run — guards against a malformed or adversarial
 * request queuing something absurd (a year-long "event", a date decades
 * out) for a device to blindly execute. */
const MAX_DAYS_OUT = 90;
const MAX_DURATION_HOURS = 24;

export interface CreatePendingCalendarWriteInput {
  userId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export const pendingCalendarWriteRepository = {
  async create(input: CreatePendingCalendarWriteInput) {
    if (input.endsAt <= input.startsAt) throw new Error('endsAt must be after startsAt');
    const daysOut = (input.startsAt.getTime() - Date.now()) / (24 * 60 * 60_000);
    if (daysOut > MAX_DAYS_OUT || daysOut < -1) throw new Error(`startsAt must be within ${MAX_DAYS_OUT} days`);
    const durationHours = (input.endsAt.getTime() - input.startsAt.getTime()) / (60 * 60_000);
    if (durationHours > MAX_DURATION_HOURS) throw new Error(`event may not exceed ${MAX_DURATION_HOURS} hours`);

    return prisma.pendingCalendarWrite.create({ data: input });
  },

  /** Same "device polls, backend queues" read as
   * `pendingDeviceCommandRepository.listPendingForUser`. */
  async listPendingForUser(userId: string) {
    return prisma.pendingCalendarWrite.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  },

  /** Scoped by userId in the same statement as every other
   * user-owned-row write in this codebase, so an id from another
   * account can't be marked complete. Returns false (not an error) for
   * an id that doesn't match — same "no such row" contract
   * `pendingDeviceCommandRepository.markCompleted` uses. */
  async markCompleted(
    id: string,
    userId: string,
    outcome: { status: 'EXECUTED' | 'FAILED'; failureReason?: string | undefined },
  ): Promise<boolean> {
    const result = await prisma.pendingCalendarWrite.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: outcome.status, failureReason: outcome.failureReason ?? null, completedAt: new Date() },
    });
    return result.count > 0;
  },
};
