import { prisma } from '../prismaClient.js';
import type { ExecutionOutcome } from '@prisma/client';

export const automationExecutionLogRepository = {
  async record(entry: {
    userId: string;
    ruleId: string;
    triggerReadingId?: string | undefined;
    outcome: ExecutionOutcome;
    failureReason?: string | undefined;
  }): Promise<void> {
    await prisma.automationExecutionLog.create({
      data: {
        userId: entry.userId,
        ruleId: entry.ruleId,
        triggerReadingId: entry.triggerReadingId ?? null,
        outcome: entry.outcome,
        failureReason: entry.failureReason ?? null,
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

  async listForUser(userId: string, limit = 50) {
    return prisma.automationExecutionLog.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: { rule: { select: { name: true } } },
    });
  },
};
