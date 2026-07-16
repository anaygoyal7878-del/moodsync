import { prisma } from '../prismaClient.js';
import type { ExecutionOutcome } from '@prisma/client';

export const automationExecutionLogRepository = {
  async record(entry: {
    userId: string;
    ruleId: string;
    triggerReadingId?: string | undefined;
    outcome: ExecutionOutcome;
    failureReason?: string | undefined;
    reason?: string | undefined;
  }): Promise<void> {
    await prisma.automationExecutionLog.create({
      data: {
        userId: entry.userId,
        ruleId: entry.ruleId,
        triggerReadingId: entry.triggerReadingId ?? null,
        outcome: entry.outcome,
        failureReason: entry.failureReason ?? null,
        reason: entry.reason ?? null,
      },
    });
  },

  /** Most recent EXECUTED timestamp for a rule, used for cooldown
   * enforcement — `null` if the rule has never successfully fired. */
  async findLastExecutedAt(ruleId: string): Promise<Date | null> {
    const row = await prisma.automationExecutionLog.findFirst({
      where: { ruleId, outcome: 'EXECUTED' },
      orderBy: { executedAt: 'desc' },
      select: { executedAt: true },
    });
    return row?.executedAt ?? null;
  },

  /** Count of EXECUTED actions in the trailing window — the safety-check
   * rate limit's data source (ai/src/dispatch.ts's RATE_LIMIT_PER_HOUR).
   * Counts log rows, not individual actions within a rule, matching how
   * cooldown/effectiveness already treat "one rule firing" as the unit. */
  async countExecutedSince(userId: string, since: Date): Promise<number> {
    return prisma.automationExecutionLog.count({
      where: { userId, outcome: 'EXECUTED', executedAt: { gte: since } },
    });
  },

  async listForUser(userId: string, limit = 50) {
    return prisma.automationExecutionLog.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: { rule: { select: { name: true } } },
    });
  },
};
