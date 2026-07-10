import { prisma } from '../prismaClient.js';
import { encryptSecret, decryptSecret } from '../crypto.js';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | undefined;
  /** Provider-specific extra secret with no natural home in a standard
   * OAuth pair — e.g. Hue's application key. */
  providerSecret?: string | undefined;
  scope: string;
  expiresAt: Date;
}

export interface DecryptedTokenSet {
  accessToken: string;
  refreshToken?: string | undefined;
  providerSecret?: string | undefined;
  scope: string;
  expiresAt: Date;
}

/**
 * The only module allowed to see a third-party access/refresh token in
 * plaintext outside of the moment it's freshly received from the provider
 * — every read decrypts on the way out, every write encrypts on the way
 * in. Provider API clients call `getDecrypted` immediately before making a
 * request and never persist the plaintext themselves.
 */
export const oauthTokenRepository = {
  async create(tokens: TokenSet): Promise<string> {
    const access = encryptSecret(tokens.accessToken);
    const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;
    const providerSecret = tokens.providerSecret ? encryptSecret(tokens.providerSecret) : null;

    const row = await prisma.oAuthToken.create({
      data: {
        accessTokenCiphertext: access.ciphertext,
        accessTokenNonce: access.nonce,
        refreshTokenCiphertext: refresh?.ciphertext ?? null,
        refreshTokenNonce: refresh?.nonce ?? null,
        providerSecretCiphertext: providerSecret?.ciphertext ?? null,
        providerSecretNonce: providerSecret?.nonce ?? null,
        scope: tokens.scope,
        expiresAt: tokens.expiresAt,
      },
    });
    return row.id;
  },

  async update(id: string, tokens: TokenSet): Promise<void> {
    const access = encryptSecret(tokens.accessToken);
    const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;
    const providerSecret = tokens.providerSecret ? encryptSecret(tokens.providerSecret) : null;

    await prisma.oAuthToken.update({
      where: { id },
      data: {
        accessTokenCiphertext: access.ciphertext,
        accessTokenNonce: access.nonce,
        refreshTokenCiphertext: refresh?.ciphertext ?? null,
        refreshTokenNonce: refresh?.nonce ?? null,
        // A provider secret (e.g. Hue's application key) is minted once
        // and doesn't rotate with the access token — only overwrite it
        // when a caller explicitly provides a new one.
        ...(providerSecret
          ? { providerSecretCiphertext: providerSecret.ciphertext, providerSecretNonce: providerSecret.nonce }
          : {}),
        scope: tokens.scope,
        expiresAt: tokens.expiresAt,
      },
    });
  },

  async getDecrypted(id: string): Promise<DecryptedTokenSet | null> {
    const row = await prisma.oAuthToken.findUnique({ where: { id } });
    if (!row) return null;

    const accessToken = decryptSecret({
      ciphertext: Buffer.from(row.accessTokenCiphertext),
      nonce: Buffer.from(row.accessTokenNonce),
    });
    const refreshToken =
      row.refreshTokenCiphertext && row.refreshTokenNonce
        ? decryptSecret({ ciphertext: Buffer.from(row.refreshTokenCiphertext), nonce: Buffer.from(row.refreshTokenNonce) })
        : undefined;
    const providerSecret =
      row.providerSecretCiphertext && row.providerSecretNonce
        ? decryptSecret({
            ciphertext: Buffer.from(row.providerSecretCiphertext),
            nonce: Buffer.from(row.providerSecretNonce),
          })
        : undefined;

    return { accessToken, refreshToken, providerSecret, scope: row.scope, expiresAt: row.expiresAt };
  },
};
