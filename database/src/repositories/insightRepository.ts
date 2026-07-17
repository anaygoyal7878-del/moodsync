import type { InsightPeriod } from '@prisma/client';
import { prisma } from '../prismaClient.js';

export interface CreateInsightInput {
  userId: string;
  period: InsightPeriod;
  metric: string;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  trend?: number | undefined;
  summary?: string | undefined;
}

export const insightRepository = {
  async createMany(entries: CreateInsightInput[]): Promise<number> {
    if (entries.length === 0) return 0;
    const result = await prisma.insight.createMany({
      data: entries.map((e) => ({
        userId: e.userId,
        period: e.period,
        metric: e.metric,
        periodStart: e.periodStart,
        periodEnd: e.periodEnd,
        value: e.value,
        trend: e.trend ?? null,
        summary: e.summary ?? null,
      })),
    });
    return result.count;
  },

  async listForUser(userId: string, period: InsightPeriod, limit = 50) {
    return prisma.insight.findMany({
      where: { userId, period },
      orderBy: { periodStart: 'desc' },
      take: limit,
    });
  },
};
