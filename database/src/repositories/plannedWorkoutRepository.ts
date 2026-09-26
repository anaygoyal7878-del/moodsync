import { prisma } from '../prismaClient.js';
import type { WorkoutKind } from '@prisma/client';

export interface PlannedWorkoutInput {
  userId: string;
  scheduledFor: Date;
  kind: WorkoutKind;
  title: string;
  plannedMinutes?: number | null;
  plannedAtMinutes?: number | null;
  notes?: string | null;
}

/**
 * Planned workouts. A plan first, a log second — see the schema comment
 * on `PlannedWorkout` for why that ordering matters.
 *
 * Every mutating method takes `userId` and filters on it with
 * `updateMany`/`deleteMany` rather than `update`/`delete` by id, the
 * same ownership convention the rest of the repositories use: an id
 * from another account resolves to zero rows rather than to someone
 * else's workout.
 */
export const plannedWorkoutRepository = {
  async create(input: PlannedWorkoutInput) {
    return prisma.plannedWorkout.create({
      data: {
        userId: input.userId,
        scheduledFor: input.scheduledFor,
        kind: input.kind,
        title: input.title,
        plannedMinutes: input.plannedMinutes ?? null,
        plannedAtMinutes: input.plannedAtMinutes ?? null,
        notes: input.notes ?? null,
      },
    });
  },

  /** Everything in a date window, soonest first — what the workout page
   * renders. Ascending because this is a forward-looking list: the next
   * thing you have to do belongs at the top. */
  async listInRange(userId: string, from: Date, to: Date) {
    return prisma.plannedWorkout.findMany({
      where: { userId, scheduledFor: { gte: from, lte: to } },
      orderBy: { scheduledFor: 'asc' },
    });
  },

  async findForDay(userId: string, day: Date) {
    const next = new Date(day.getTime() + 24 * 60 * 60_000);
    return prisma.plannedWorkout.findMany({
      where: { userId, scheduledFor: { gte: day, lt: next } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async markCompleted(id: string, userId: string, actualMinutes: number | null, perceivedEffort: number | null) {
    const result = await prisma.plannedWorkout.updateMany({
      where: { id, userId },
      data: { completedAt: new Date(), actualMinutes, perceivedEffort },
    });
    return result.count > 0;
  },

  async remove(id: string, userId: string) {
    const result = await prisma.plannedWorkout.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },

  /**
   * Workouts scheduled for today that still need a reminder.
   *
   * `remindedAt: null` is the whole dedupe mechanism, and it is a column
   * rather than a "did we send one recently" query because the question
   * is per-workout, not per-user: someone with two sessions planned for
   * one day should get told about both.
   *
   * Completed workouts are excluded — reminding someone about a session
   * they already finished is the fastest way to teach them the reminders
   * are not paying attention.
   */
  async listNeedingReminder(userId: string, day: Date) {
    const next = new Date(day.getTime() + 24 * 60 * 60_000);
    return prisma.plannedWorkout.findMany({
      where: {
        userId,
        scheduledFor: { gte: day, lt: next },
        remindedAt: null,
        completedAt: null,
      },
      orderBy: { plannedAtMinutes: 'asc' },
    });
  },

  /** Completed sessions since a date, for training-load. Selects only
   * the three fields load needs rather than whole rows. */
  async listCompletedSince(userId: string, since: Date) {
    return prisma.plannedWorkout.findMany({
      where: { userId, completedAt: { gte: since } },
      select: { completedAt: true, actualMinutes: true, plannedMinutes: true, perceivedEffort: true },
      orderBy: { completedAt: 'desc' },
    });
  },

  async markReminded(ids: string[]) {
    if (ids.length === 0) return;
    await prisma.plannedWorkout.updateMany({ where: { id: { in: ids } }, data: { remindedAt: new Date() } });
  },
};
