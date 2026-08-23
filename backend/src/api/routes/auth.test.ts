import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Set before the dynamic import below, not in beforeAll — the import
// chain (auth.ts -> authService.ts -> jwt.ts -> env.ts) validates env
// vars at module-load time, which for a top-level `await import()`
// happens during collection, before any beforeAll hook runs.
process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.OAUTH_STATE_SECRET ??= 'c'.repeat(32);
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));

vi.mock('../../services/authService.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/authService.js')>('../../services/authService.js');
  return {
    ...actual,
    authService: { ...actual.authService, login: (...args: unknown[]) => loginMock(...args) },
  };
});

const authRoutes = (await import('./auth.js')).default;

/**
 * Registers the real rate-limit plugin (not stubbed) so this test
 * exercises the actual per-route override, not a mock of it — the
 * thing worth verifying is that `/auth/login`'s tight limit actually
 * takes effect, not just that the config object was passed correctly.
 */
function buildApp() {
  const app = Fastify();
  app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  app.register(authRoutes, { prefix: '/api' });
  return app;
}

const VALID_LOGIN = { email: 'user@example.com', password: 'a-real-password' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /auth/login — rate limiting', () => {
  it('allows requests under the per-route limit (8/min)', async () => {
    loginMock.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    const app = buildApp();

    for (let i = 0; i < 8; i++) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: VALID_LOGIN });
      expect(response.statusCode).toBe(200);
    }
  });

  it('blocks the 9th login attempt from the same client within a minute', async () => {
    // A real, concrete brute-force check: unlimited /auth/login attempts
    // were possible before this plugin was wired in at all — no
    // @fastify/rate-limit dependency, no per-route config, nothing.
    loginMock.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    const app = buildApp();

    for (let i = 0; i < 8; i++) {
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: VALID_LOGIN });
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: VALID_LOGIN });

    expect(blocked.statusCode).toBe(429);
    expect(loginMock).toHaveBeenCalledTimes(8);
  });

  it('still validates credentials normally under the limit', async () => {
    const { InvalidCredentialsError } = await vi.importActual<typeof import('../../services/authService.js')>(
      '../../services/authService.js',
    );
    loginMock.mockRejectedValue(new InvalidCredentialsError());
    const app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: VALID_LOGIN });

    expect(response.statusCode).toBe(401);
  });
});
