import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  authService,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../../services/authService.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  // Length floor only — see OWASP ASVS: don't impose composition rules
  // (uppercase/symbol requirements) that push users toward predictable
  // patterns. A password strength meter belongs in the frontend, not a
  // rejected-request loop here.
  password: z.string().min(10).max(256),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

/**
 * Per-route overrides of the global rate limit (`server.ts`'s 300/min
 * default), tight specifically on the endpoints that are real
 * brute-force/abuse surfaces. Keyed by IP (the plugin's default) — a
 * per-account counter would additionally stop a distributed attacker
 * rotating IPs against one email, but that needs its own DB-backed
 * state; IP-based is the standard baseline mitigation and what this
 * plugin gives for free.
 */
const LOGIN_RATE_LIMIT = { max: 8, timeWindow: '1 minute' };
// Tighter than login — signup abuse is spam account creation, not
// credential guessing, and legitimate signup is a rare, one-time action
// per person.
const SIGNUP_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };
// Looser than login — refresh fires legitimately across multiple open
// tabs/devices as 15-minute access tokens expire, so it needs more
// headroom while still bounding a stolen-refresh-token guessing loop.
const REFRESH_RATE_LIMIT = { max: 20, timeWindow: '1 minute' };

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', { config: { rateLimit: SIGNUP_RATE_LIMIT } }, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const tokens = await authService.signup(parsed.data.email, parsed.data.password, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });
      return reply.code(201).send(tokens);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/auth/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const tokens = await authService.login(parsed.data.email, parsed.data.password, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });
      return reply.send(tokens);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/auth/refresh', { config: { rateLimit: REFRESH_RATE_LIMIT } }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const tokens = await authService.refresh(parsed.data.refreshToken, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });
      return reply.send(tokens);
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await authService.logout(parsed.data.refreshToken);
    return reply.code(204).send();
  });
}
