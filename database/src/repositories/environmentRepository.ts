import { prisma } from '../prismaClient.js';
import type { EnvironmentAutomationLevel, EnvironmentSessionStatus } from '@prisma/client';

/**
 * Adaptive Environment persistence — automation settings and the
 * proposal/outcome sessions that back the learning loop.
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */

/** Defaults for a user who has never opened the settings screen.
 * Mirrors the Prisma column defaults exactly — returned rather than
 * written on read, so merely viewing the dashboard doesn't create a
 * settings row for every user. */
export const DEFAULT_ENVIRONMENT_SETTINGS = {
  level: 'SUGGEST' as EnvironmentAutomationLevel,
  lightingEnabled: true,
  musicEnabled: true,
  temperatureEnabled: true,
  sceneEnabled: false,
  maxLightingDeltaPct: 25,
  maxTemperatureDeltaC: 1.5,
  blockedHoursStart: null as number | null,
  blockedHoursEnd: null as number | null,
  lastManualOverrideAt: null as Date | null,
  lastAutomationAt: null as Date | null,
};

export type EnvironmentSettings = typeof DEFAULT_ENVIRONMENT_SETTINGS;

/** How long a proposal stays actionable. Past this it's stale — the
 * state that motivated it has almost certainly moved on, and applying
 * it would be acting on old information. */
export const PROPOSAL_TTL_MINUTES = 30;

export const environmentRepository = {
  /** Never creates a row — an unconfigured user gets the defaults. */
  async getSettings(userId: string): Promise<EnvironmentSettings> {
    const row = await prisma.environmentAutomationSettings.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_ENVIRONMENT_SETTINGS };
    return {
      level: row.level,
      lightingEnabled: row.lightingEnabled,
      musicEnabled: row.musicEnabled,
      temperatureEnabled: row.temperatureEnabled,
      sceneEnabled: row.sceneEnabled,
      maxLightingDeltaPct: row.maxLightingDeltaPct,
      maxTemperatureDeltaC: row.maxTemperatureDeltaC,
      blockedHoursStart: row.blockedHoursStart,
      blockedHoursEnd: row.blockedHoursEnd,
      lastManualOverrideAt: row.lastManualOverrideAt,
      lastAutomationAt: row.lastAutomationAt,
    };
  },

  /**
   * Values are explicitly `| undefined` rather than merely optional:
   * callers parse partial patches from request bodies, where an absent
   * field arrives as a real `undefined` and `exactOptionalPropertyTypes`
   * won't accept that against a plain optional. Undefined keys are
   * stripped before the write, so an omitted field means "leave it
   * alone" rather than "set it to null".
   */
  async updateSettings(
    userId: string,
    patch: { [K in keyof Omit<EnvironmentSettings, 'lastManualOverrideAt' | 'lastAutomationAt'>]?: EnvironmentSettings[K] | undefined },
  ) {
    const data = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    return prisma.environmentAutomationSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  },

  /** Stamped when MoodSync actually changes something — the input to
   * the automation cooldown. */
  async markAutomationRun(userId: string, at: Date = new Date()) {
    await prisma.environmentAutomationSettings.upsert({
      where: { userId },
      create: { userId, lastAutomationAt: at },
      update: { lastAutomationAt: at },
    });
  },

  /** Stamped when the user countermands MoodSync in a way it can
   * observe (declining a proposal). Suppresses automation for a while
   * afterward — see environmentGuards.ts. */
  async markManualOverride(userId: string, at: Date = new Date()) {
    await prisma.environmentAutomationSettings.upsert({
      where: { userId },
      create: { userId, lastManualOverrideAt: at },
      update: { lastManualOverrideAt: at },
    });
  },

  async createSession(input: {
    userId: string;
    state: string;
    confidence: number;
    signalsJson: string;
    proposalJson: string;
    status: EnvironmentSessionStatus;
    baselineHeartRate: number | null;
    baselineStressScore: number | null;
  }) {
    return prisma.environmentSession.create({ data: input });
  },

  /** The still-actionable proposal for this user, if any. Anything
   * older than the TTL is treated as gone rather than resurfaced. */
  async findActiveProposal(userId: string, now: Date = new Date()) {
    return prisma.environmentSession.findFirst({
      where: {
        userId,
        status: 'PROPOSED',
        createdAt: { gte: new Date(now.getTime() - PROPOSAL_TTL_MINUTES * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** userId-scoped so one user can never respond to another's
   * proposal. Returns null when the id doesn't belong to them. */
  async respond(id: string, userId: string, status: EnvironmentSessionStatus) {
    const result = await prisma.environmentSession.updateMany({
      where: { id, userId, status: 'PROPOSED' },
      data: { status, respondedAt: new Date() },
    });
    if (result.count === 0) return null;
    return prisma.environmentSession.findUnique({ where: { id } });
  },

  async recordOutcome(
    id: string,
    userId: string,
    outcome: {
      outcomeHeartRateDelta: number | null;
      outcomeStressDelta: number | null;
      outcomeConfidence: string;
      outcomeSummary: string;
    },
  ) {
    const result = await prisma.environmentSession.updateMany({
      where: { id, userId },
      data: { ...outcome, endedAt: new Date() },
    });
    return result.count > 0;
  },

  /** Accepted/auto-applied sessions with a measured outcome — the
   * input to the learning engine. */
  async listCompletedForLearning(userId: string, sinceDays: number) {
    return prisma.environmentSession.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  },

  /** Sessions still awaiting an outcome — what the outcome worker
   * picks up once enough time has passed to measure a response. */
  async listAwaitingOutcome(userId: string, olderThanMinutes: number) {
    return prisma.environmentSession.findMany({
      where: {
        userId,
        status: { in: ['ACCEPTED', 'AUTO_APPLIED'] },
        endedAt: null,
        createdAt: { lte: new Date(Date.now() - olderThanMinutes * 60_000) },
      },
      take: 50,
    });
  },
};

/** How far back to load observations when measuring held-duration.
 * Comfortably longer than any plausible continuous stretch, so the
 * gap-detection in ai/src/stateHistory.ts is what bounds the answer
 * rather than an arbitrary query limit. */
const OBSERVATION_LOOKBACK_HOURS = 12;

export const stateObservationRepository = {
  /** Records one assessment. Called on every state evaluation — the
   * series' irregularity is expected and handled by
   * `computeStateHeldMinutes`. */
  async record(userId: string, state: string, confidence: number) {
    return prisma.stateObservation.create({ data: { userId, state, confidence } });
  },

  /** Newest-first, which is the order `computeStateHeldMinutes` walks. */
  async listRecent(userId: string, now: Date = new Date()) {
    return prisma.stateObservation.findMany({
      where: { userId, observedAt: { gte: new Date(now.getTime() - OBSERVATION_LOOKBACK_HOURS * 60 * 60_000) } },
      orderBy: { observedAt: 'desc' },
      take: 200,
    });
  },

  /** Retention: this table grows on every dashboard load, and nothing
   * reads past the lookback window. Called by the outcome worker so
   * pruning rides along with an existing scheduled job rather than
   * needing its own. */
  async pruneOlderThan(days: number) {
    const result = await prisma.stateObservation.deleteMany({
      where: { observedAt: { lt: new Date(Date.now() - days * 24 * 60 * 60_000) } },
    });
    return result.count;
  },
};

/** Cross-user sweep for the outcome worker — the per-user
 * `listAwaitingOutcome` above can't drive a scheduled job that doesn't
 * know which users to look at. */
export async function listAllAwaitingOutcome(olderThanMinutes: number, limit = 200) {
  return prisma.environmentSession.findMany({
    where: {
      status: { in: ['ACCEPTED', 'AUTO_APPLIED'] },
      endedAt: null,
      createdAt: { lte: new Date(Date.now() - olderThanMinutes * 60_000) },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}
