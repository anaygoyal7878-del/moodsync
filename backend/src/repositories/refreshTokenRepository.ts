import { prisma, hashToken } from '@moodsync/database';

export const refreshTokenRepository = {
  async store(params: {
    userId: string;
    token: string;
    expiresAt: Date;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
  }): Promise<void> {
    await prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: hashToken(params.token),
        expiresAt: params.expiresAt,
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  },

  /** Returns the matching row only if it exists, isn't revoked, and hasn't expired. */
  async findActive(token: string) {
    const tokenHash = hashToken(token);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
    return record;
  },

  async revoke(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  /** Revokes every refresh token for a user — used on password change or suspected breach. */
  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },
};
