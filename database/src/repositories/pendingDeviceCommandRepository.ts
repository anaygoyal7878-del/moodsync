import { prisma } from '../prismaClient.js';
import type { Prisma, SmartHomeProvider } from '@prisma/client';
import type { AutomationAction } from '@moodsync/shared';

function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

export const pendingDeviceCommandRepository = {
  /** Queues an action HomeKit's cloudless architecture can't execute
   * server-side — see ai/src/dispatch.ts and docs/HOMEKIT_ARCHITECTURE.md. */
  async create(entry: { userId: string; provider: SmartHomeProvider; action: AutomationAction; ruleId?: string | undefined }) {
    return prisma.pendingDeviceCommand.create({
      data: {
        userId: entry.userId,
        provider: entry.provider,
        action: toJson(entry.action),
        ruleId: entry.ruleId ?? null,
      },
    });
  },

  /** What the iOS companion app polls on open — oldest first, so a
   * backlog executes in the order it was decided, not reverse. */
  async listPendingForUser(userId: string) {
    const rows = await prisma.pendingDeviceCommand.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({ ...row, action: row.action as unknown as AutomationAction }));
  },

  /** `updateMany` (not `update`) so the userId ownership check is
   * enforced by the query itself — same pattern as every other
   * user-scoped repository in this codebase. */
  async markCompleted(id: string, userId: string, outcome: { status: 'EXECUTED' | 'FAILED'; failureReason?: string | undefined }): Promise<boolean> {
    const result = await prisma.pendingDeviceCommand.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: {
        status: outcome.status,
        failureReason: outcome.failureReason ?? null,
        completedAt: new Date(),
      },
    });
    return result.count > 0;
  },
};
