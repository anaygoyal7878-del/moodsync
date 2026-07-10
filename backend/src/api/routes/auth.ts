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

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (request, reply) => {
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

  app.post('/auth/login', async (request, reply) => {
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

  app.post('/auth/refresh', async (request, reply) => {
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
