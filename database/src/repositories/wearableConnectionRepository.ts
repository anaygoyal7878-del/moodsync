import { prisma } from '../prismaClient.js';
import { ConnectionStatus, type WearableProvider } from '@prisma/client';
import { oauthTokenRepository, type TokenSet } from './oauthTokenRepository.js';

export const wearableConnectionRepository = {
  /** Creates the connection on first authorization, or re-links it (fresh
   * tokens, status back to ACTIVE) if the user disconnects and reconnects
   * the same provider later. */
  async upsertConnection(params: {
    userId: string;
    provider: WearableProvider;
    providerUserId?: string | undefined;
    tokens: TokenSet;
  }) {
    const existing = await prisma.wearableConnection.findUnique({
      where: { userId_provider: { userId: params.userId, provider: params.provider } },
    });

    if (existing?.oauthTokenId) {
      await oauthTokenRepository.update(existing.oauthTokenId, params.tokens);
      return prisma.wearableConnection.update({
        where: { id: existing.id },
        data: { status: ConnectionStatus.ACTIVE, providerUserId: params.providerUserId ?? null },
      });
    }

    const oauthTokenId = await oauthTokenRepository.create(params.tokens);
    return prisma.wearableConnection.upsert({
      where: { userId_provider: { userId: params.userId, provider: params.provider } },
      create: {
        userId: params.userId,
        provider: params.provider,
        providerUserId: params.providerUserId ?? null,
        oauthTokenId,
        status: ConnectionStatus.ACTIVE,
      },
      update: { oauthTokenId, status: ConnectionStatus.ACTIVE, providerUserId: params.providerUserId ?? null },
    });
  },

  /** For providers with no OAuth handshake at all — Apple Health/HealthKit
   * has no server-side API or OAuth flow (see
   * docs/INTEGRATIONS_RESEARCH.md), so "connecting" it just means the iOS
   * companion app has authenticated with the user's existing MoodSync
   * session and successfully pushed a sync. `oauthTokenId` stays null;
   * `WearableConnection.oauthTokenId` is nullable specifically to allow
   * this. */
  async upsertTokenlessConnection(userId: string, provider: WearableProvider) {
    return prisma.wearableConnection.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, status: ConnectionStatus.ACTIVE },
      update: { status: ConnectionStatus.ACTIVE },
    });
  },

  async findByUserAndProvider(userId: string, provider: WearableProvider) {
    return prisma.wearableConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  },

  /** Every connection a user has ever made, active or not — what the
   * dashboard's connections list renders (so a revoked connection still
   * shows up with a "reconnect" affordance rather than disappearing). */
  async listForUser(userId: string) {
    return prisma.wearableConnection.findMany({ where: { userId }, orderBy: { provider: 'asc' } });
  },

  /** Every active connection for a provider — what the sync worker
   * iterates over on each run. */
  async listActive(provider: WearableProvider) {
    return prisma.wearableConnection.findMany({ where: { provider, status: ConnectionStatus.ACTIVE } });
  },

  async markSynced(id: string): Promise<void> {
    await prisma.wearableConnection.update({ where: { id }, data: { lastSyncedAt: new Date() } });
  },

  /** Only Google Health (Fitbit) populates these today — see
   * `docs/INTEGRATIONS_RESEARCH.md` for why WHOOP never will (no battery
   * endpoint exists in their public API). */
  async updateDeviceInfo(
    id: string,
    info: { deviceName?: string | undefined; batteryLevel?: number | undefined; batteryStatus?: string | undefined },
  ): Promise<void> {
    await prisma.wearableConnection.update({
      where: { id },
      data: {
        deviceName: info.deviceName ?? null,
        batteryLevel: info.batteryLevel ?? null,
        batteryStatus: info.batteryStatus ?? null,
      },
    });
  },

  async markStatus(id: string, status: ConnectionStatus): Promise<void> {
    await prisma.wearableConnection.update({ where: { id }, data: { status } });
  },

  /** Ownership-scoped so a userId/id mismatch is a no-op, not a leak
   * (same `updateMany` pattern as automationRuleRepository). */
  async disconnect(id: string, userId: string): Promise<boolean> {
    const result = await prisma.wearableConnection.updateMany({
      where: { id, userId },
      data: { status: ConnectionStatus.REVOKED },
    });
    return result.count > 0;
  },
};
