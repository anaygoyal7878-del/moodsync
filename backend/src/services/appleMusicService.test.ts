import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify, decodeProtectedHeader } from 'jose';

const env: Record<string, string | undefined> = {};
vi.mock('../config/env.js', () => ({ env }));
vi.mock('@moodsync/database', () => ({ appleMusicConnectionRepository: {} }));

const { appleMusicService, normalizePrivateKey, AppleMusicNotConfiguredError } = await import('./appleMusicService.js');

async function testKey() {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  return { pem: await exportPKCS8(privateKey), spki: await exportSPKI(publicKey) };
}

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
});

describe('normalizePrivateKey', () => {
  it('turns literal \\n sequences into real line breaks', () => {
    expect(normalizePrivateKey('-----BEGIN-----\\nabc\\n-----END-----')).toBe('-----BEGIN-----\nabc\n-----END-----');
  });

  it('leaves a key with real line breaks unchanged', () => {
    expect(normalizePrivateKey('a\nb\n')).toBe('a\nb');
  });
});

describe('issueDeveloperToken', () => {
  it('reports missing credentials as not configured', async () => {
    await expect(appleMusicService.issueDeveloperToken()).rejects.toBeInstanceOf(AppleMusicNotConfiguredError);
  });

  it('signs a verifiable token from a key stored on one line', async () => {
    // Regression: the documented single-line form failed to import and
    // every developer-token request returned an opaque 500.
    const { pem, spki } = await testKey();
    Object.assign(env, { APPLE_MUSIC_TEAM_ID: 'TEAM123456', APPLE_MUSIC_KEY_ID: 'KEY1234567', APPLE_MUSIC_PRIVATE_KEY: pem.replace(/\n/g, '\\n') });

    const { token } = await appleMusicService.issueDeveloperToken();
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const { payload } = await jwtVerify(token, await importSPKI(spki, 'ES256'));
    expect(payload.iss).toBe('TEAM123456');
  });

  it('reports an unreadable key as a configuration problem without echoing it', async () => {
    Object.assign(env, { APPLE_MUSIC_TEAM_ID: 'T', APPLE_MUSIC_KEY_ID: 'K', APPLE_MUSIC_PRIVATE_KEY: 'not-a-real-key-secret' });
    const error = await appleMusicService.issueDeveloperToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppleMusicNotConfiguredError);
    expect((error as Error).message).not.toContain('not-a-real-key-secret');
  });
});
