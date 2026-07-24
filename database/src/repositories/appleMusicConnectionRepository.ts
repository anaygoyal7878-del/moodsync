import { prisma } from '../prismaClient.js';
import { encryptSecret, decryptSecret } from '../crypto.js';
import { ConnectionStatus } from '@prisma/client';
import type { AppleMusicConnection } from '@prisma/client';

export interface AppleMusicConnectionSummary {
  id: string;
  status: ConnectionStatus;
  storefront: string | null;
  lastSyncedAt: Date | null;
}

function toSummary(row: AppleMusicConnection): AppleMusicConnectionSummary {
  return { id: row.id, status: row.status, storefront: row.storefront, lastSyncedAt: row.lastSyncedAt };
}

/**
 * One row per user (`@@unique([userId])` — no `provider` column at all,
 * unlike SmartHomeConnection, since there's only ever one Apple Music
 * connection per account). The music-user-token is the only secret here,
 * so encryption happens inline in this repository rather than being
 * split out to a shared OAuthToken row — see the schema doc comment on
 * `AppleMusicConnection` for why it doesn't reuse that table.
 */
export const appleMusicConnectionRepository = {
  async upsertConnection(params: { userId: string; musicUserToken: string; storefront?: string | undefined }): Promise<void> {
    const encrypted = encryptSecret(params.musicUserToken);
    await prisma.appleMusicConnection.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        musicUserTokenCiphertext: encrypted.ciphertext,
        musicUserTokenNonce: encrypted.nonce,
        storefront: params.storefront ?? null,
        status: ConnectionStatus.ACTIVE,
        lastSyncedAt: new Date(),
      },
      update: {
        musicUserTokenCiphertext: encrypted.ciphertext,
        musicUserTokenNonce: encrypted.nonce,
        storefront: params.storefront ?? null,
        status: ConnectionStatus.ACTIVE,
        lastSyncedAt: new Date(),
      },
    });
  },

  async findByUser(userId: string): Promise<AppleMusicConnectionSummary | null> {
    const row = await prisma.appleMusicConnection.findUnique({ where: { userId } });
    return row ? toSummary(row) : null;
  },

  /** Only callers that are about to make an Apple Music API call on the
   * user's behalf (server-side library sync, playlist creation) should
   * ever see the plaintext token — mirrors oauthTokenRepository's
   * `getDecrypted` naming so the "this is a secret, treat it carefully"
   * signal is consistent across every provider in the codebase. */
  async getDecryptedToken(userId: string): Promise<string | null> {
    const row = await prisma.appleMusicConnection.findUnique({ where: { userId } });
    if (!row) return null;
    return decryptSecret({
      ciphertext: Buffer.from(row.musicUserTokenCiphertext),
      nonce: Buffer.from(row.musicUserTokenNonce),
    });
  },

  async markSynced(userId: string): Promise<void> {
    await prisma.appleMusicConnection.updateMany({ where: { userId }, data: { lastSyncedAt: new Date() } });
  },

  /** Scoped by userId (not just id) in the `updateMany` for the same
   * auth-safety reason smartHomeConnectionRepository.disconnect uses —
   * a caller can only ever disconnect their own connection. */
  async disconnect(userId: string): Promise<boolean> {
    const result = await prisma.appleMusicConnection.updateMany({
      where: { userId },
      data: { status: ConnectionStatus.REVOKED },
    });
    return result.count > 0;
  },
};
