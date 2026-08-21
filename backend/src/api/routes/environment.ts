import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { environmentService } from '../../services/environmentService.js';

/**
 * Adaptive Environment API. Every route is session-authenticated and
 * userId-scoped at the repository layer — a session id from another
 * account resolves to nothing rather than to someone else's proposal.
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */

const settingsSchema = z.object({
  level: z.enum(['SUGGEST', 'ASSIST', 'AUTOMATE']).optional(),
  lightingEnabled: z.boolean().optional(),
  musicEnabled: z.boolean().optional(),
  temperatureEnabled: z.boolean().optional(),
  sceneEnabled: z.boolean().optional(),
  scentEnabled: z.boolean().optional(),
  // Bounded server-side, not just in the UI: these are the anti-jarring
  // limits, and a client must not be able to widen them arbitrarily.
  maxLightingDeltaPct: z.number().int().min(5).max(60).optional(),
  maxTemperatureDeltaC: z.number().min(0.5).max(3).optional(),
  blockedHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  blockedHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
});

export default async function environmentRoutes(app: FastifyInstance) {
  /** The dashboard's environment card: state, proposal, why, and what
   * MoodSync would do. Read-only — never creates a session. */
  app.get('/environment/snapshot', { preHandler: app.authenticate }, async (request, reply) => {
    const snapshot = await environmentService.getSnapshot(request.userId!);
    return reply.send(snapshot);
  });

  /** Persists the current proposal so it can be accepted and measured.
   * 204 when there's nothing to propose — an honest empty, not a 404. */
  app.post('/environment/proposals', { preHandler: app.authenticate }, async (request, reply) => {
    const session = await environmentService.createProposal(request.userId!);
    if (!session) return reply.code(204).send();
    return reply.code(201).send({ session });
  });

  /** Executes the proposal's actionable changes. Reports per-change
   * success and failure rather than a blanket "done" — a partially
   * applied environment is a real outcome the user should see. */
  app.post('/environment/proposals/:id/accept', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await environmentService.accept(request.userId!, id);
    if (!result) return reply.code(404).send({ error: 'No such open proposal' });
    return reply.send(result);
  });

  app.post('/environment/proposals/:id/reject', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await environmentService.reject(request.userId!, id);
    if (!session) return reply.code(404).send({ error: 'No such open proposal' });
    return reply.send({ session });
  });

  /** Measures the biometric response after an applied environment. */
  app.post('/environment/proposals/:id/outcome', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const outcome = await environmentService.measureOutcome(request.userId!, id);
    if (!outcome) return reply.code(404).send({ error: 'No session awaiting an outcome' });
    return reply.send(outcome);
  });

  /** Charts behind the analytics page. `days` bounds only the daily
   * acceptance series; frequency and outcome aggregate the full
   * learning window. */
  app.get('/environment/analytics', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return reply.send(await environmentService.getAnalytics(request.userId!, parsed.data.days));
  });

  app.get('/environment/settings', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send(await environmentService.getSettings(request.userId!));
  });

  app.patch('/environment/settings', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await environmentService.updateSettings(request.userId!, parsed.data);
    return reply.send(await environmentService.getSettings(request.userId!));
  });
}
