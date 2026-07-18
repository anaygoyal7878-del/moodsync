import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userPreferencesRepository, resourcePauseRepository } from '@moodsync/database';

const pauseSchema = z.object({
  // Minutes from now, capped at 24h — a manual override is meant to be
  // short-lived, not a replacement for disabling a rule outright (that's
  // what a rule's own `enabled` toggle is for).
  minutes: z.number().int().min(1).max(1440).default(60),
});

// SmartHomeProviderId values (shared/src/wearables.ts) — a resource pause
// is scoped to a provider, not a wearable, since only smart-home
// providers take automation actions.
const RESOURCE_PROVIDERS = ['hue', 'spotify', 'ecobee', 'alexa', 'homekit'] as const;
const resourceProviderSchema = z.enum(RESOURCE_PROVIDERS);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be "HH:mm" 24-hour time');

const notificationPreferencesSchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    quietHoursStart: timeSchema.nullable().optional(),
    quietHoursEnd: timeSchema.nullable().optional(),
    notificationDigestMode: z.enum(['IMMEDIATE', 'HOURLY']).optional(),
  })
  .refine((data) => (data.quietHoursStart == null) === (data.quietHoursEnd == null), {
    message: 'quietHoursStart and quietHoursEnd must both be set or both be null',
    path: ['quietHoursEnd'],
  });

/** The manual-override control described in
 * docs/DECISION_ENGINE_ARCHITECTURE.md — a single, simple, per-user pause
 * rather than per-resource overrides (roadmap item, not built here). */
export default async function preferencesRoutes(app: FastifyInstance) {
  app.get('/preferences/automation-pause', { preHandler: app.authenticate }, async (request, reply) => {
    const pausedUntil = await userPreferencesRepository.getAutomationsPausedUntil(request.userId!);
    return reply.send({
      pausedUntil: pausedUntil?.toISOString() ?? null,
      // Computed server-side (not by the frontend re-comparing against
      // Date.now() during render, which React's purity rule flags even
      // in a Server Component) — see frontend/src/app/dashboard/page.tsx.
      isPaused: pausedUntil !== null && pausedUntil.getTime() > Date.now(),
    });
  });

  app.post('/preferences/automation-pause', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = pauseSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const pausedUntil = new Date(Date.now() + parsed.data.minutes * 60_000);
    await userPreferencesRepository.setAutomationsPausedUntil(request.userId!, pausedUntil);
    return reply.send({ pausedUntil: pausedUntil.toISOString() });
  });

  app.delete('/preferences/automation-pause', { preHandler: app.authenticate }, async (request, reply) => {
    await userPreferencesRepository.setAutomationsPausedUntil(request.userId!, null);
    return reply.code(204).send();
  });

  /** Per-provider pause, alongside the global one above — see
   * ResourcePause in schema.prisma and ai/src/dispatch.ts's per-action
   * pause check. */
  app.get('/preferences/automation-pause/resource', { preHandler: app.authenticate }, async (request, reply) => {
    const pauses = await resourcePauseRepository.listActiveForUser(request.userId!);
    return reply.send({ pauses: Object.fromEntries([...pauses].map(([provider, until]) => [provider, until.toISOString()])) });
  });

  app.post<{ Params: { provider: string } }>(
    '/preferences/automation-pause/resource/:provider',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const providerParsed = resourceProviderSchema.safeParse(request.params.provider);
      if (!providerParsed.success) return reply.code(400).send({ error: `Unknown provider: ${request.params.provider}` });

      const parsed = pauseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const pausedUntil = new Date(Date.now() + parsed.data.minutes * 60_000);
      await resourcePauseRepository.set(request.userId!, providerParsed.data, pausedUntil);
      return reply.send({ provider: providerParsed.data, pausedUntil: pausedUntil.toISOString() });
    },
  );

  app.delete<{ Params: { provider: string } }>(
    '/preferences/automation-pause/resource/:provider',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const providerParsed = resourceProviderSchema.safeParse(request.params.provider);
      if (!providerParsed.success) return reply.code(400).send({ error: `Unknown provider: ${request.params.provider}` });

      await resourcePauseRepository.clear(request.userId!, providerParsed.data);
      return reply.code(204).send();
    },
  );

  /** Quiet hours + the notifications on/off switch — see
   * ai/src/notificationExecutor.ts's `shouldNotify` for where these are
   * actually enforced (suppresses only the notification, never the
   * underlying AutomationExecutionLog audit trail). */
  app.get('/preferences/notifications', { preHandler: app.authenticate }, async (request, reply) => {
    const prefs = await userPreferencesRepository.getNotificationPreferences(request.userId!);
    return reply.send(prefs);
  });

  app.patch('/preferences/notifications', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = notificationPreferencesSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await userPreferencesRepository.setNotificationPreferences(request.userId!, parsed.data);
    const prefs = await userPreferencesRepository.getNotificationPreferences(request.userId!);
    return reply.send(prefs);
  });
}
