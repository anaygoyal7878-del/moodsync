import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
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
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
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
