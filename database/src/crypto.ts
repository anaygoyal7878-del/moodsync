import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Lives in the data-access package (not the backend API app) because
 * encryption-at-rest is a property of the data layer, not the HTTP layer
 * — both the backend API and the background workers process write/read
 * `oauth_tokens` directly and both need this. Reads
 * `OAUTH_TOKEN_ENCRYPTION_KEY` from `process.env` directly rather than a
 * shared config module, since backend and workers each validate their own
 * environment independently (see backend/src/config/env.ts) but both
 * point at the same underlying secret.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the AES-GCM standard recommendation
const AUTH_TAG_LENGTH = 16;

function loadKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32)');
  }
  return key;
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  cachedKey ??= loadKey();
  return cachedKey;
}

/**
 * Plain `Uint8Array`, not `Buffer`: Prisma's generated types for `Bytes`
 * columns are `Uint8Array<ArrayBuffer>`, and Node's `Buffer` type is
 * backed by `ArrayBufferLike` (which also covers `SharedArrayBuffer`),
 * so a `Buffer` doesn't structurally satisfy Prisma's stricter type even
 * though it's a `Uint8Array` at runtime. `Uint8Array.from` copies into a
 * plain, non-shared-backed array, which does.
 */
export interface EncryptedPayload {
  ciphertext: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
}

/**
 * Encrypts a third-party OAuth token before it's ever written to
 * `oauth_tokens`. The auth tag is appended to the ciphertext so a single
 * `Bytes` column holds everything needed to decrypt (nonce stays separate
 * since Postgres/Prisma models it as its own column for clarity).
 */
export function encryptSecret(plaintext: string): EncryptedPayload {
  const nonce = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: Uint8Array.from(Buffer.concat([encrypted, authTag])), nonce: Uint8Array.from(nonce) };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const ciphertext = payload.ciphertext.subarray(0, payload.ciphertext.length - AUTH_TAG_LENGTH);
  const authTag = payload.ciphertext.subarray(payload.ciphertext.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), payload.nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** SHA-256 hash used for refresh-token lookups — these are high-entropy
 * random tokens, not passwords, so a fast hash is appropriate (unlike
 * password storage, which uses argon2 in the backend app). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
