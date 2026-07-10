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

  async findByUserAndProvider(userId: string, provider: WearableProvider) {
    return prisma.wearableConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  },

  /** Every active connection for a provider — what the sync worker
   * iterates over on each run. */
  async listActive(provider: WearableProvider) {
    return prisma.wearableConnection.findMany({ where: { provider, status: ConnectionStatus.ACTIVE } });
  },

  async markSynced(id: string): Promise<void> {
    await prisma.wearableConnection.update({ where: { id }, data: { lastSyncedAt: new Date() } });
  },

  async markStatus(id: string, status: ConnectionStatus): Promise<void> {
    await prisma.wearableConnection.update({ where: { id }, data: { status } });
  },
};
