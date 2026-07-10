import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the AES-GCM standard recommendation

const key = Buffer.from(env.OAUTH_TOKEN_ENCRYPTION_KEY, 'base64');

export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
}

/**
 * Encrypts a third-party OAuth token before it's ever written to
 * `oauth_tokens`. The auth tag is appended to the ciphertext so a single
 * `Bytes` column holds everything needed to decrypt (nonce stays separate
 * since Postgres/Prisma models it as its own column for clarity).
 */
export function encryptSecret(plaintext: string): EncryptedPayload {
  const nonce = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, authTag]), nonce };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const AUTH_TAG_LENGTH = 16;
  const ciphertext = payload.ciphertext.subarray(0, payload.ciphertext.length - AUTH_TAG_LENGTH);
  const authTag = payload.ciphertext.subarray(payload.ciphertext.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, payload.nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** SHA-256 hash used for refresh-token lookups — these are high-entropy
 * random tokens, not passwords, so a fast hash is appropriate (unlike
 * password storage, which uses argon2 — see auth/password.ts). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
