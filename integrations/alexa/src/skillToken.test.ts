import { describe, expect, it } from 'vitest';
import {
  signAlexaAccessToken,
  verifyAlexaAccessToken,
  generateAlexaRefreshToken,
  InvalidAlexaAccessTokenError,
} from './skillToken.js';

const SECRET = 'a'.repeat(32);

describe('signAlexaAccessToken / verifyAlexaAccessToken', () => {
  it('round-trips the userId', async () => {
    const { token, expiresInSeconds } = await signAlexaAccessToken(SECRET, 'user-1');
    expect(expiresInSeconds).toBe(3600);
    const verified = await verifyAlexaAccessToken(SECRET, token);
    expect(verified.userId).toBe('user-1');
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signAlexaAccessToken(SECRET, 'user-1');
    await expect(verifyAlexaAccessToken('b'.repeat(32), token)).rejects.toThrow(InvalidAlexaAccessTokenError);
  });

  it('rejects garbage input', async () => {
    await expect(verifyAlexaAccessToken(SECRET, 'not-a-real-token')).rejects.toThrow(InvalidAlexaAccessTokenError);
  });

  it('rejects a MoodSync web-session-shaped token (no alexa-skill audience)', async () => {
    // Simulates the defense-in-depth scenario described in
    // skillToken.ts's doc comment: a JWT signed with the SAME secret but
    // without the 'alexa-skill' audience claim must still be rejected.
    const { SignJWT } = await import('jose');
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    await expect(verifyAlexaAccessToken(SECRET, token)).rejects.toThrow(InvalidAlexaAccessTokenError);
  });
});

describe('generateAlexaRefreshToken', () => {
  it('generates a non-empty, URL-safe token', () => {
    const token = generateAlexaRefreshToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a different token each call', () => {
    expect(generateAlexaRefreshToken()).not.toBe(generateAlexaRefreshToken());
  });
});
