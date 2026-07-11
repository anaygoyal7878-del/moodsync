import { prisma } from '../prismaClient.js';
import type { Prisma } from '@prisma/client';
import type { AutomationRuleDefinition, RuleCondition, AutomationAction } from '@moodsync/shared';

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
}): AutomationRuleDefinition {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    enabled: row.enabled,
    conditions: row.conditions as RuleCondition[],
    actions: row.actions as AutomationAction[],
    cooldownMinutes: row.cooldownMinutes,
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
