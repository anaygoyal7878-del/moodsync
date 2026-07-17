/**
 * Persists weekly `Insight` rows — the schema modeled this since before
 * Milestone 10, but nothing ever wrote to it; `/api/insights` computed
 * trends on-the-fly per request instead (see
 * docs/DECISION_ENGINE_ROADMAP.md's "Weekly reports, persisted insights"
 * entry). Run this on a weekly cron cadence via
 * `npm run start:weekly-report -w workers` — same "periodic tick, only
 * touch users with real data" shape as
 * `workers/src/scheduledDispatch.ts`.
 */
import { biometricReadingRepository, insightRepository } from '@moodsync/database';
import { computeWeeklyInsights } from '@moodsync/ai';

const REPORT_WINDOW_DAYS = 14; // 7 days "current" vs. 7 days "previous", same half-split insights.ts already uses.

const periodEnd = new Date();
const periodStart = new Date(periodEnd.getTime() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

const userIds = await biometricReadingRepository.listUserIdsWithRecentReadings(REPORT_WINDOW_DAYS);
console.log(`[weekly-report] Found ${userIds.length} user(s) with recent readings`);

let totalRows = 0;
let anyFailed = false;
for (const userId of userIds) {
  try {
    const readingsOldestFirst = [...(await biometricReadingRepository.listRecentNormalized(userId, REPORT_WINDOW_DAYS))].reverse();
    const rows = computeWeeklyInsights({ userId, periodStart, periodEnd, readingsOldestFirst });
    const inserted = await insightRepository.createMany(rows);
    totalRows += inserted;
    if (inserted > 0) console.log(`[weekly-report] user=${userId} rows=${inserted}`);
  } catch (error) {
    anyFailed = true;
    console.error(`[weekly-report] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[weekly-report] Done. ${totalRows} insight row(s) persisted across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
