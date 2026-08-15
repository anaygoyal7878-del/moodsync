/**
 * Environment outcome measurement — the MEASURE step of the Adaptive
 * Environment loop, which until now had an endpoint but nothing calling
 * it. Without this, `EnvironmentSession.outcome*` stayed null forever
 * and the learning engine's biometric half never received a single
 * data point.
 *
 * Run on a periodic cron cadence (suggested: every 15-30 minutes —
 * often enough that a session is measured while the comparison is
 * still meaningful, rarely enough to stay cheap) via
 * `npm run start:environment-outcome -w workers`. Same "periodic tick,
 * only touch rows that need it" shape as
 * `workers/src/proactiveNotificationsWorker.ts`.
 *
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */
import {
  listAllAwaitingOutcome,
  environmentRepository,
  stateObservationRepository,
  biometricReadingRepository,
} from '@moodsync/database';

/** How long after an environment is applied to measure the response.
 * Matches environmentService.ts's own window — long enough for a
 * change to plausibly show up in a reading, short enough that the
 * comparison is still about this session rather than the rest of the
 * day. */
const OUTCOME_WINDOW_MINUTES = 25;

/** Past this, stop waiting. A session with no comparable reading four
 * hours later is never going to get one, and leaving it open forever
 * means the worker re-examines it on every tick. */
const ABANDON_AFTER_MINUTES = 4 * 60;

/** State observations are written on every dashboard load and nothing
 * reads past a 12-hour window. Pruning rides along here rather than
 * needing its own scheduled job. */
const OBSERVATION_RETENTION_DAYS = 3;

const sessions = await listAllAwaitingOutcome(OUTCOME_WINDOW_MINUTES);
console.log(`[environment-outcome] ${sessions.length} session(s) awaiting measurement`);

let measured = 0;
let insufficient = 0;
let anyFailed = false;

for (const session of sessions) {
  try {
    const ageMinutes = (Date.now() - session.createdAt.getTime()) / 60_000;
    const latest = await biometricReadingRepository.findLatestNormalized(session.userId);
    const currentHr = latest?.reading.heartRate ?? null;

    // No baseline, no current reading, or simply too old to keep
    // waiting — all resolve to `insufficient` rather than a fabricated
    // zero delta. ai/src/environmentLearning.ts excludes these from its
    // averages instead of treating them as "no change", which is why
    // the distinction has to be recorded rather than smoothed over.
    if (session.baselineHeartRate === null || currentHr === null) {
      if (ageMinutes < ABANDON_AFTER_MINUTES) continue; // still worth waiting
      await environmentRepository.recordOutcome(session.id, session.userId, {
        outcomeHeartRateDelta: null,
        outcomeStressDelta: null,
        outcomeConfidence: 'insufficient',
        outcomeSummary: 'Not enough heart rate data to compare before and after.',
      });
      insufficient++;
      continue;
    }

    const delta = currentHr - session.baselineHeartRate;
    const direction = delta < 0 ? 'dropped' : 'rose';
    await environmentRepository.recordOutcome(session.id, session.userId, {
      outcomeHeartRateDelta: delta,
      outcomeStressDelta: null,
      outcomeConfidence: 'measured',
      outcomeSummary: `Your heart rate ${direction} ${Math.abs(Math.round(delta))} BPM during this session.`,
    });
    measured++;
  } catch (error) {
    anyFailed = true;
    console.error(
      `[environment-outcome] session=${session.id} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

try {
  const pruned = await stateObservationRepository.pruneOlderThan(OBSERVATION_RETENTION_DAYS);
  if (pruned > 0) console.log(`[environment-outcome] pruned ${pruned} old state observation(s)`);
} catch (error) {
  anyFailed = true;
  console.error('[environment-outcome] observation prune failed:', error instanceof Error ? error.message : error);
}

console.log(`[environment-outcome] Done. ${measured} measured, ${insufficient} insufficient.`);
process.exit(anyFailed ? 1 : 0);
