import { prisma } from '../prismaClient.js';
import { Prisma } from '@prisma/client';
import type { AutomationRuleDefinition, RuleCondition, AutomationAction, TimeWindow, LocationEventType } from '@moodsync/shared';

/** RuleCondition[]/AutomationAction[] are plain JSON-shaped interfaces
 * (strings/numbers/Record<string,unknown>), so this cast is a type-system
 * bridge, not a runtime risk — Prisma's `InputJsonValue` type just doesn't
 * structurally recognize a named interface array as JSON-compatible. */
function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toDomain(row: {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  conditions: unknown;
  actions: unknown;
  cooldownMinutes: number;
  priority: number;
  timeWindow: unknown;
  notificationsEnabled: boolean;
  locationTrigger: LocationEventType | null;
}): AutomationRuleDefinition {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    enabled: row.enabled,
    conditions: row.conditions as RuleCondition[],
    actions: row.actions as AutomationAction[],
    cooldownMinutes: row.cooldownMinutes,
    priority: row.priority,
    ...(row.timeWindow ? { timeWindow: row.timeWindow as TimeWindow } : {}),
    notificationsEnabled: row.notificationsEnabled,
    ...(row.locationTrigger ? { locationTrigger: row.locationTrigger } : {}),
  };
}

async function findById(id: string, userId: string): Promise<AutomationRuleDefinition | null> {
  const row = await prisma.automationRule.findFirst({ where: { id, userId } });
  return row ? toDomain(row) : null;
}

/** Explicit `| undefined` on every field (rather than `Partial<...>`) so
 * this matches what a Zod `.partial()` schema's inferred output type
 * actually looks like under `exactOptionalPropertyTypes: true` — see
 * backend/src/api/routes/automationRules.ts's `updateRuleSchema`. */
export interface AutomationRuleUpdateInput {
  name?: string | undefined;
  enabled?: boolean | undefined;
  conditions?: RuleCondition[] | undefined;
  actions?: AutomationAction[] | undefined;
  cooldownMinutes?: number | undefined;
  priority?: number | undefined;
  timeWindow?: TimeWindow | null | undefined;
  notificationsEnabled?: boolean | undefined;
  locationTrigger?: LocationEventType | null | undefined;
}

export const automationRuleRepository = {
  async listEnabledForUser(userId: string): Promise<AutomationRuleDefinition[]> {
    const rows = await prisma.automationRule.findMany({ where: { userId, enabled: true } });
    return rows.map(toDomain);
  },

  async listForUser(userId: string): Promise<AutomationRuleDefinition[]> {
    const rows = await prisma.automationRule.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toDomain);
  },

  /** Every distinct user with at least one enabled, time-window rule —
   * what workers/src/scheduledDispatch.ts iterates, so the scheduled tick
   * doesn't have to scan every user in the system on every run. */
  async listUserIdsWithScheduledRules(): Promise<string[]> {
    const rows = await prisma.automationRule.findMany({
      where: { enabled: true, timeWindow: { not: Prisma.JsonNull } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  },

  findById,

  async create(input: Omit<AutomationRuleDefinition, 'id'>): Promise<AutomationRuleDefinition> {
    const row = await prisma.automationRule.create({
      data: {
        userId: input.userId,
        name: input.name,
        enabled: input.enabled,
        conditions: toJson(input.conditions),
        actions: toJson(input.actions),
        cooldownMinutes: input.cooldownMinutes,
        priority: input.priority,
        ...(input.timeWindow ? { timeWindow: toJson(input.timeWindow) } : {}),
        ...(input.notificationsEnabled !== undefined ? { notificationsEnabled: input.notificationsEnabled } : {}),
        ...(input.locationTrigger ? { locationTrigger: input.locationTrigger } : {}),
      },
    });
    return toDomain(row);
  },

  /** `updateMany` (not `update`) so the userId ownership check is enforced
   * by the database query itself, not by trusting the caller to have
   * checked first — returns null if no row matched both id and userId. */
  async update(id: string, userId: string, input: AutomationRuleUpdateInput): Promise<AutomationRuleDefinition | null> {
    const result = await prisma.automationRule.updateMany({
      where: { id, userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.conditions !== undefined ? { conditions: toJson(input.conditions) } : {}),
        ...(input.actions !== undefined ? { actions: toJson(input.actions) } : {}),
        ...(input.cooldownMinutes !== undefined ? { cooldownMinutes: input.cooldownMinutes } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.timeWindow !== undefined
          ? { timeWindow: input.timeWindow ? toJson(input.timeWindow) : Prisma.JsonNull }
          : {}),
        ...(input.notificationsEnabled !== undefined ? { notificationsEnabled: input.notificationsEnabled } : {}),
        ...(input.locationTrigger !== undefined ? { locationTrigger: input.locationTrigger } : {}),
      },
    });
    if (result.count === 0) return null;
    return findById(id, userId);
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await prisma.automationRule.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
