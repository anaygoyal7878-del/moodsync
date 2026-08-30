import type { FastifyInstance } from 'fastify';
import { wearableConnectionRepository } from '@moodsync/database';
import { whoopService } from '../../services/whoopService.js';
import { fitbitService } from '../../services/fitbitService.js';

/**
 * "Refresh everything I can actually refresh" — what pull-to-refresh in
 * the dashboard calls.
 *
 * The honest scope here is the whole point. Only two of the four wearable
 * providers can be re-pulled on demand at all:
 *
 * - **WHOOP / Google Health (Fitbit)** — real OAuth APIs this server can
 *   call outbound. These genuinely re-sync.
 * - **Apple Health / Amazfit** — *push*-only. HealthKit has no server-side
 *   API (see docs/APPLE_HEALTH_ARCHITECTURE.md) and the Amazfit Zepp Mini
 *   Program pushes on its own schedule; the phone/watch decides when data
 *   arrives, and nothing this server does can pull it sooner.
 *
 * So a refresh reports per-provider outcomes rather than a single
 * success/failure, and the UI says plainly which providers were skipped
 * and why. Telling someone "refreshed!" when their Apple Watch data
 * physically cannot be re-pulled from here would be a lie the moment
 * their numbers didn't change.
 *
 * One provider failing (an expired refresh token, WHOOP down) must never
 * fail the others — each is caught independently, same best-effort shape
 * as `workers/src/syncAllWorker.ts`.
 */

/** Providers this server can pull from, mapped to the service that does
 * it. Anything absent from this map is push-only by nature, not
 * unimplemented — see this file's doc comment. */
const PULLABLE = {
  WHOOP: (connectionId: string, userId: string) => whoopService.syncConnection(connectionId, userId),
  GOOGLE_HEALTH: (connectionId: string, userId: string) => fitbitService.syncConnection(connectionId, userId),
} as const;

type PullableProvider = keyof typeof PULLABLE;

export interface ProviderSyncResult {
  provider: string;
  status: 'synced' | 'failed' | 'push_only';
  /** Rows actually written. Only meaningful for `synced`. */
  readingsInserted?: number;
  /** Why this provider didn't sync — user-facing, so no stack traces. */
  detail?: string;
}

export default async function syncRoutes(app: FastifyInstance) {
  app.post('/sync/all', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const connections = await wearableConnectionRepository.listForUser(userId);
    const active = connections.filter((c) => c.status === 'ACTIVE');

    const results: ProviderSyncResult[] = await Promise.all(
      active.map(async (connection): Promise<ProviderSyncResult> => {
        const pull = PULLABLE[connection.provider as PullableProvider];
        if (!pull) {
          return {
            provider: connection.provider,
            status: 'push_only',
            detail: 'Sends data from your device on its own schedule — there is nothing to pull from here.',
          };
        }

        try {
          const readingsInserted = await pull(connection.id, userId);
          return { provider: connection.provider, status: 'synced', readingsInserted };
        } catch (error) {
          // Logged in full server-side; the client gets a short reason.
          request.log.error({ err: error, provider: connection.provider }, 'sync/all: provider sync failed');
          return {
            provider: connection.provider,
            status: 'failed',
            detail: error instanceof Error ? error.message : 'Sync failed',
          };
        }
      }),
    );

    const synced = results.filter((r) => r.status === 'synced');
    return reply.send({
      results,
      readingsInserted: synced.reduce((sum, r) => sum + (r.readingsInserted ?? 0), 0),
      syncedCount: synced.length,
      failedCount: results.filter((r) => r.status === 'failed').length,
    });
  });
}
