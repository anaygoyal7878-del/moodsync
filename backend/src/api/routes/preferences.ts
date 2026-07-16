import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userPreferencesRepository } from '@moodsync/database';

const pauseSchema = z.object({
  // Minutes from now, capped at 24h — a manual override is meant to be
  // short-lived, not a replacement for disabling a rule outright (that's
  // what a rule's own `enabled` toggle is for).
  minutes: z.number().int().min(1).max(1440).default(60),
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
}
