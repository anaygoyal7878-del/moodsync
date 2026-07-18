/**
 * Batches each `notificationDigestMode: HOURLY` user's queued
 * `PendingNotificationDigestEntry` rows into one combined `Notification`
 * per run, then clears the consumed entries. Run this on an hourly cron
 * cadence via `npm run start:notification-digest -w workers` — same
 * "periodic tick, only touch users with real data" shape as
 * `workers/src/weeklyReportWorker.ts`.
 */
import { notificationRepository, pendingNotificationDigestRepository } from '@moodsync/database';

const userIds = await pendingNotificationDigestRepository.listUserIdsWithPendingEntries();
console.log(`[notification-digest] Found ${userIds.length} user(s) with pending entries`);

let totalBatched = 0;
let anyFailed = false;
for (const userId of userIds) {
  try {
    const entries = await pendingNotificationDigestRepository.listForUser(userId);
    if (entries.length === 0) continue;

    const title = entries.length === 1 ? entries[0]!.title : `${entries.length} automation updates`;
    const body = entries.map((e) => `${e.title}: ${e.body}`).join('\n');
    // A digest summarizes several rules at once, so it isn't tied to any
    // single one — ruleId is intentionally omitted, unlike an immediate
    // per-outcome Notification.
    await notificationRepository.create({ userId, title, body });

    const cleared = await pendingNotificationDigestRepository.deleteForUser(userId);
    totalBatched += cleared;
    console.log(`[notification-digest] user=${userId} batched ${cleared} entrie(s) into 1 notification`);
  } catch (error) {
    anyFailed = true;
    console.error(`[notification-digest] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[notification-digest] Done. ${totalBatched} entrie(s) batched across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
