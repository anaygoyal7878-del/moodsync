import { describe, expect, it, beforeAll } from 'vitest';

// OAUTH_TOKEN_ENCRYPTION_KEY is validated by config/env.ts at import time,
// so it must be set before that module (transitively imported by
// lib/crypto.ts) loads.
beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext string', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    const plaintext = 'a-third-party-oauth-access-token';
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different nonce (and ciphertext) on every call', async () => {
    const { encryptSecret } = await import('./crypto.js');
    const a = encryptSecret('same-plaintext');
    const b = encryptSecret('same-plaintext');
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails to decrypt if the ciphertext has been tampered with', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    const encrypted = encryptSecret('sensitive-value');
    encrypted.ciphertext[0] = (encrypted.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', async () => {
    const { hashToken } = await import('./crypto.js');
    expect(hashToken('refresh-token-value')).toBe(hashToken('refresh-token-value'));
  });

  it('differs for different inputs', async () => {
    const { hashToken } = await import('./crypto.js');
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});
