import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import authenticatePlugin from './plugins/authenticate.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import whoopRoutes from './routes/integrations/whoop.js';
import hueRoutes from './routes/integrations/hue.js';
import fitbitRoutes from './routes/integrations/fitbit.js';
import spotifyRoutes from './routes/integrations/spotify.js';
import appleHealthRoutes from './routes/integrations/appleHealth.js';
import alexaRoutes from './routes/integrations/alexa.js';
import amazfitRoutes from './routes/integrations/amazfit.js';
import automationRuleRoutes from './routes/automationRules.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import preferencesRoutes from './routes/preferences.js';
import deviceRoutes from './routes/devices.js';
import recommendationRoutes from './routes/recommendations.js';
import locationEventRoutes from './routes/locationEvents.js';
import meditationSessionRoutes from './routes/meditationSessions.js';
import atlasRoutes from './routes/atlas.js';

export async function buildServer() {
  const app = Fastify({ loggerInstance: logger, trustProxy: true });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(sensible);
  await app.register(authenticatePlugin);

  // Registered before any route plugins deliberately: Fastify captures the
  // active error handler at the point a child (encapsulated) context is
  // created via `.register()`. Setting it after route registration means
  // routes registered in their own plugin context (every file under
  // routes/) silently fall back to Fastify's default handler — which
  // leaks raw internal error messages (e.g. a Prisma connection error's
  // full text) to the client. Confirmed empirically, not just from docs:
  // swapping this order is the difference between a generic 500 body and
  // an internal stack trace being returned to the caller.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(meRoutes, { prefix: '/api' });
  await app.register(whoopRoutes, { prefix: '/api' });
  await app.register(hueRoutes, { prefix: '/api' });
  await app.register(fitbitRoutes, { prefix: '/api' });
  await app.register(spotifyRoutes, { prefix: '/api' });
  await app.register(appleHealthRoutes, { prefix: '/api' });
  await app.register(alexaRoutes, { prefix: '/api' });
  await app.register(amazfitRoutes, { prefix: '/api' });
  await app.register(automationRuleRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  await app.register(preferencesRoutes, { prefix: '/api' });
  await app.register(deviceRoutes, { prefix: '/api' });
  await app.register(recommendationRoutes, { prefix: '/api' });
  await app.register(locationEventRoutes, { prefix: '/api' });
  await app.register(meditationSessionRoutes, { prefix: '/api' });
  await app.register(atlasRoutes, { prefix: '/api' });

  return app;
}
