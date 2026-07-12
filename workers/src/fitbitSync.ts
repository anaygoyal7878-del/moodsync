/**
 * Standalone entrypoint for Fitbit (Google Health) — same shape and
 * rationale as whoopSync.ts. Run via `npm run start:fitbit-sync -w workers`.
 */
import { runProviderSync } from './lib/runProviderSync.js';
import { createFitbitSyncRunner } from './providers/fitbit.js';

const tally = await runProviderSync(createFitbitSyncRunner());
process.exit(tally.allFailed ? 1 : 0);
