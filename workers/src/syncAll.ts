/**
 * Runs every configured wearable provider's sync in one invocation —
 * convenient for a single scheduled job (one cron entry, one CronJob)
 * instead of coordinating N separate schedules. Each provider still
 * fails independently: a provider with no client credentials set is
 * skipped (not fatal — not every deployment has every integration
 * configured), and one provider throwing doesn't stop the others from
 * running. Run via `npm run start:sync-all -w workers`.
 *
 * Only WHOOP and Fitbit are here because they're the only providers with
 * anything to poll on a schedule: Hue devices are synced on-demand from
 * the dashboard, Spotify has no "readings" to sync, and Apple Health has
 * no server-side sync at all — its data arrives via the iOS companion
 * app pushing to /api/integrations/apple-health/ingest, not this worker
 * pulling (see docs/INTEGRATIONS_RESEARCH.md's "Apple Health" section).
 */
import { runProviderSync, type SyncTally, type ProviderSyncRunner } from './lib/runProviderSync.js';
import { createWhoopSyncRunner } from './providers/whoop.js';
import { createFitbitSyncRunner } from './providers/fitbit.js';

interface ProviderJob {
  name: string;
  createRunner: () => ProviderSyncRunner;
}

const jobs: ProviderJob[] = [
  { name: 'whoop', createRunner: createWhoopSyncRunner },
  { name: 'fitbit', createRunner: createFitbitSyncRunner },
];

const tallies: SyncTally[] = [];
let anyRan = false;

for (const job of jobs) {
  let runner;
  try {
    runner = job.createRunner();
  } catch (error) {
    // Missing client credentials for this provider — skip it, not fatal.
    // A deployment with only WHOOP configured shouldn't fail its whole
    // sync run because Fitbit isn't set up yet.
    console.log(`[sync-all] Skipping ${job.name}: ${error instanceof Error ? error.message : error}`);
    continue;
  }

  anyRan = true;
  tallies.push(await runProviderSync(runner));
}

if (!anyRan) {
  console.log('[sync-all] No providers configured — nothing to do.');
}

const exitCode = tallies.some((t) => t.allFailed) ? 1 : 0;
console.log(`[sync-all] Done. ${tallies.map((t) => `${t.provider}: ${t.succeeded} ok / ${t.failed} failed`).join(', ')}`);
process.exit(exitCode);
