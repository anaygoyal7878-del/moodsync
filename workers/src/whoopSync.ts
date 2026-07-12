/**
 * Standalone entrypoint (not a long-running poll loop): syncs every active
 * WHOOP connection once, then exits. Meant to be invoked on a schedule by
 * an external scheduler (cron, a Kubernetes CronJob, etc.) — see
 * docs/MILESTONES.md's note on why `workers` is a separate deployable from
 * the API server, not a `setInterval` inside it. Run via
 * `npm run start:whoop-sync -w workers`.
 *
 * The actual sync logic (token refresh, the API client) lives in
 * providers/whoop.ts; the generic per-connection loop it plugs into lives
 * in lib/runProviderSync.ts, shared with every other wearable worker.
 */
import { runProviderSync } from './lib/runProviderSync.js';
import { createWhoopSyncRunner } from './providers/whoop.js';

const tally = await runProviderSync(createWhoopSyncRunner());
process.exit(tally.allFailed ? 1 : 0);
