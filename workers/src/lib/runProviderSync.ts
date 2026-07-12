import { wearableConnectionRepository, biometricReadingRepository, type WearableConnection } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';

export interface SyncTally {
  provider: string;
  succeeded: number;
  failed: number;
  /** True when there were connections and every one of them failed —
   * the signal a caller uses to decide a non-zero exit code (a run with
   * zero active connections is a success, not a failure). */
  allFailed: boolean;
}

export interface ProviderSyncRunner {
  provider: WearableConnection['provider'];
  /** Short tag used in every log line, e.g. `whoop-sync`. */
  logPrefix: string;
  /**
   * Fetch this one connection's latest data and persist it, returning the
   * number of readings inserted. Everything provider-specific
   * (token refresh, the API client, device-info sync) lives here; the
   * generic orchestration around it (which connections to run, marking
   * synced, firing automations, per-connection error isolation) lives in
   * `runProviderSync` so the two wearable workers can't drift apart on it.
   * `connection.oauthTokenId` is guaranteed non-null when this is called.
   */
  syncConnection(connection: WearableConnection): Promise<number>;
}

/**
 * Runs one scheduled sync pass for a single provider: sync every active
 * connection, isolate failures so one revoked token doesn't stop other
 * users, mark newly-synced connections, and fire automations off the
 * latest reading. Pure orchestration — see `ProviderSyncRunner` for where
 * the provider-specific work goes.
 */
export async function runProviderSync(runner: ProviderSyncRunner): Promise<SyncTally> {
  const connections = await wearableConnectionRepository.listActive(runner.provider);
  console.log(`[${runner.logPrefix}] Found ${connections.length} active connection(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      if (!connection.oauthTokenId) throw new Error('Connection has no linked OAuth token');

      const inserted = await runner.syncConnection(connection);
      await wearableConnectionRepository.markSynced(connection.id);

      if (inserted > 0) {
        // Automations react to the user's current state — only the latest
        // reading after this sync triggers evaluation, never the whole
        // backfilled window (same rule as the manual "sync now" path).
        const latest = await biometricReadingRepository.findLatestNormalized(connection.userId);
        if (latest) await dispatchForReading(latest.reading, latest.id);
      }

      console.log(`[${runner.logPrefix}] user=${connection.userId} inserted=${inserted}`);
      succeeded++;
    } catch (error) {
      failed++;
      console.error(`[${runner.logPrefix}] user=${connection.userId} failed:`, error instanceof Error ? error.message : error);
      // A single connection's refresh token being revoked on the
      // provider's side shouldn't stop other users' syncs — mark just
      // this one errored (surfaced in the dashboard as "reconnect") and
      // move on.
      await wearableConnectionRepository.markStatus(connection.id, 'ERROR');
    }
  }

  console.log(`[${runner.logPrefix}] Done. succeeded=${succeeded} failed=${failed}`);
  return { provider: runner.provider, succeeded, failed, allFailed: connections.length > 0 && succeeded === 0 };
}
