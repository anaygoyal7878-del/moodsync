import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.OAUTH_STATE_SECRET ??= 'c'.repeat(32);
  process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
});

describe('parseDurationMs', () => {
  it('parses seconds, minutes, hours, and days', async () => {
    const { parseDurationMs } = await import('./refreshToken.js');
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('2h')).toBe(2 * 3_600_000);
    expect(parseDurationMs('30d')).toBe(30 * 86_400_000);
  });

  it('rejects an unrecognized format', async () => {
    const { parseDurationMs } = await import('./refreshToken.js');
    expect(() => parseDurationMs('15 minutes')).toThrow();
    expect(() => parseDurationMs('15')).toThrow();
    expect(() => parseDurationMs('m15')).toThrow();
    expect(() => parseDurationMs('')).toThrow();
  });
});

describe('generateRefreshToken', () => {
  it('produces a unique, URL-safe token with a future expiry', async () => {
    const { generateRefreshToken } = await import('./refreshToken.js');
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
