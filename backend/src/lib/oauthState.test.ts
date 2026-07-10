import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.OAUTH_STATE_SECRET ??= 'c'.repeat(32);
  process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
});

describe('createOAuthState / verifyOAuthState', () => {
  it('round-trips the payload', async () => {
    const { createOAuthState, verifyOAuthState } = await import('./oauthState.js');
    const payload = {
      userId: 'user-1',
      provider: 'whoop' as const,
      codeVerifier: 'verifier-value',
      returnTo: 'https://app.example.com/connected',
    };

    const state = await createOAuthState(payload);
    const verified = await verifyOAuthState(state);

    expect(verified).toEqual(payload);
  });

  it('rejects a tampered token', async () => {
    const { createOAuthState, verifyOAuthState, InvalidOAuthStateError } = await import('./oauthState.js');
    const state = await createOAuthState({
      userId: 'user-1',
      provider: 'hue' as const,
      codeVerifier: 'verifier-value',
      returnTo: 'https://app.example.com/connected',
    });

    const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a');
    await expect(verifyOAuthState(tampered)).rejects.toThrow(InvalidOAuthStateError);
  });

  it('rejects garbage input', async () => {
    const { verifyOAuthState, InvalidOAuthStateError } = await import('./oauthState.js');
    await expect(verifyOAuthState('not-a-real-token')).rejects.toThrow(InvalidOAuthStateError);
  });
});
