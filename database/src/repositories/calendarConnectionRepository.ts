import { prisma } from '../prismaClient.js';
import { ConnectionStatus } from '@prisma/client';
import { oauthTokenRepository, type TokenSet } from './oauthTokenRepository.js';

/**
 * One row per user (`@@unique([userId])`, no `provider` column) — Google
 * Calendar is this codebase's only calendar integration, same shape as
 * AppleMusicConnection in that regard. Unlike AppleMusicConnection it
 * does use the shared OAuthToken table, because Google Calendar is a
 * standard OAuth 2.0 + refresh-token provider like WHOOP/Fitbit/Hue —
 * see docs/GOOGLE_CALENDAR_INTEGRATION.md.
 */
export const calendarConnectionRepository = {
  async upsertConnection(params: { userId: string; tokens: TokenSet }) {
    const existing = await prisma.calendarConnection.findUnique({ where: { userId: params.userId } });

    if (existing?.oauthTokenId) {
      await oauthTokenRepository.update(existing.oauthTokenId, params.tokens);
      return prisma.calendarConnection.update({
        where: { id: existing.id },
        data: { status: ConnectionStatus.ACTIVE },
      });
    }

    const oauthTokenId = await oauthTokenRepository.create(params.tokens);
    return prisma.calendarConnection.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, oauthTokenId, status: ConnectionStatus.ACTIVE },
      update: { oauthTokenId, status: ConnectionStatus.ACTIVE },
    });
  },

  async findByUser(userId: string) {
    return prisma.calendarConnection.findUnique({ where: { userId } });
  },

  async markSynced(id: string): Promise<void> {
    await prisma.calendarConnection.update({ where: { id }, data: { lastSyncedAt: new Date() } });
  },

  async markStatus(id: string, status: ConnectionStatus): Promise<void> {
    await prisma.calendarConnection.update({ where: { id }, data: { status } });
  },

  async disconnect(userId: string): Promise<boolean> {
    const result = await prisma.calendarConnection.updateMany({
      where: { userId },
      data: { status: ConnectionStatus.REVOKED },
    });
    return result.count > 0;
  },
};
