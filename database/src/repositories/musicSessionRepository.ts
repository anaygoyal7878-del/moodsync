import { prisma } from '../prismaClient.js';
import type { MusicMode, MusicProviderKind } from '@prisma/client';

export interface StartMusicSessionInput {
  userId: string;
  mode: MusicMode;
  provider: MusicProviderKind;
  itemName: string;
  itemKind: string;
  itemExternalId: string | null;
  genre: string | null;
  startedAt: Date;
  baselineHeartRate: number | null;
  baselineStressScore: number | null;
  baselineRecoveryScore: number | null;
}

export interface CompleteMusicSessionInput {
  endedAt: Date;
  endedEarly: boolean;
  outcomeHeartRateDelta: number | null;
  outcomeStressDelta: number | null;
  outcomeConfidence: string;
  outcomeSummary: string;
}

/** Sessions this old with no `endedAt` are treated as abandoned rather
 * than open — a user who closes the tab mid-playlist shouldn't leave a
 * session hanging forever and poison the next `findOpenSession`. */
const ABANDONED_AFTER_HOURS = 6;

export const musicSessionRepository = {
  async start(input: StartMusicSessionInput) {
    return prisma.musicSession.create({ data: input });
  },

  /**
   * Records one biometric sample against an open session.
   *
   * Ownership is checked against the session's `userId` rather than
   * trusted from the caller, and a closed session is refused: samples
   * arriving after `endedAt` would silently extend a session's chart
   * past the point the outcome was computed from, making the graph and
   * the summary disagree.
   */
  async addSample(
    sessionId: string,
    userId: string,
    sample: { at: Date; heartRate: number | null; stressScore: number | null },
  ): Promise<boolean> {
    const session = await prisma.musicSession.findFirst({
      where: { id: sessionId, userId, endedAt: null },
      select: { id: true },
    });
    if (!session) return false;

    await prisma.musicSessionSample.create({
      data: { sessionId, at: sample.at, heartRate: sample.heartRate, stressScore: sample.stressScore },
    });
    return true;
  },

  /** A session's samples in time order, for the evolution chart. */
  async listSamples(sessionId: string, userId: string) {
    const session = await prisma.musicSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
    if (!session) return null;
    return prisma.musicSessionSample.findMany({ where: { sessionId }, orderBy: { at: 'asc' } });
  },

  /** Ends a session, writing the computed outcome. Scoped by userId as
   * well as id so a caller can only ever complete their own session —
   * same auth-safety pattern as smartHomeConnectionRepository.disconnect. */
  async complete(id: string, userId: string, input: CompleteMusicSessionInput) {
    const result = await prisma.musicSession.updateMany({ where: { id, userId, endedAt: null }, data: input });
    if (result.count === 0) return null;
    return prisma.musicSession.findUnique({ where: { id } });
  },

  async findById(id: string, userId: string) {
    const session = await prisma.musicSession.findUnique({ where: { id } });
    return session && session.userId === userId ? session : null;
  },

  /** The user's currently-playing session, if any — what the client
   * reconnects to after a refresh so it doesn't start a duplicate. */
  async findOpenSession(userId: string) {
    return prisma.musicSession.findFirst({
      where: { userId, endedAt: null, startedAt: { gte: new Date(Date.now() - ABANDONED_AFTER_HOURS * 3_600_000) } },
      orderBy: { startedAt: 'desc' },
    });
  },

  async listRecent(userId: string, limit: number) {
    return prisma.musicSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  },

  /** Completed sessions in the window — the input to every aggregation
   * in ai/src/musicMemory.ts. Only sessions that actually ended are
   * included; an open session has no outcome to learn from. */
  async listCompletedSince(userId: string, sinceDays: number) {
    return prisma.musicSession.findMany({
      where: { userId, endedAt: { not: null }, startedAt: { gte: new Date(Date.now() - sinceDays * 86_400_000) } },
      orderBy: { startedAt: 'desc' },
    });
  },
};
