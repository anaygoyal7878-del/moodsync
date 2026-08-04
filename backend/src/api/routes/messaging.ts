import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { messagingRepository } from '@moodsync/database';
import { messagingService, verifyWebhookSignature } from '../../services/messagingService.js';
import { env } from '../../config/env.js';

const CHANNELS = ['IMESSAGE', 'SMS', 'WHATSAPP'] as const;

const startSchema = z.object({
  channel: z.enum(CHANNELS),
  handle: z.string().min(3).max(120),
});

/**
 * Inbound webhook payload.
 *
 * Deliberately loose: every bridge provider names these fields
 * differently (`from`/`sender`/`recipient`, `text`/`body`/`message`).
 * Rather than hard-code one provider's shape and pretend it's a
 * standard, the route accepts the union and normalizes. Adding a
 * provider means adding its field name here, not rewriting the
 * pipeline. See docs/MESSAGING_BOT.md.
 */
const webhookSchema = z.object({
  channel: z.enum(CHANNELS).optional(),
  from: z.string().min(1).optional(),
  sender: z.string().min(1).optional(),
  recipient: z.string().min(1).optional(),
  text: z.string().max(4000).optional(),
  body: z.string().max(4000).optional(),
  message: z.string().max(4000).optional(),
});

export default async function messagingRoutes(app: FastifyInstance) {
  /**
   * Starts binding a handle to the signed-in account and returns the
   * code to display. The code is shown *in the app*, then texted back
   * from the device — that round trip is what proves the person holding
   * the handle is the person holding the account.
   */
  app.post('/messaging/connections', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await messagingService.startVerification(request.userId!, parsed.data.channel, parsed.data.handle);
    if (!result) {
      // Generic on purpose — confirming that a handle is taken would
      // let someone enumerate which numbers have MoodSync accounts.
      return reply.code(409).send({ error: 'That number could not be added. Try a different one.' });
    }

    return reply.code(201).send({
      connection: result.connection,
      code: result.code,
      expiresInMinutes: 15,
    });
  });

  app.get('/messaging/connections', { preHandler: app.authenticate }, async (request, reply) => {
    const connections = await messagingRepository.listForUser(request.userId!);
    // Never return the pending code on a list — it's only handed out
    // once, at the moment it's created.
    return reply.send({
      connections: connections.map(({ verificationCode: _code, ...rest }) => rest),
    });
  });

  app.delete('/messaging/connections/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await messagingRepository.disconnect(id, request.userId!);
    if (!removed) return reply.code(404).send({ error: 'Connection not found' });
    return reply.code(204).send();
  });

  /**
   * Provider webhook. Unauthenticated by session (the provider has no
   * session) and therefore authenticated by HMAC signature over the raw
   * body instead.
   *
   * Rejects with 401 when the signature is missing, wrong, or when no
   * secret is configured at all — an open endpoint that answers
   * questions about someone's health data is not an acceptable default.
   */
  app.post('/messaging/webhook', async (request, reply) => {
    const signature =
      (request.headers['x-moodsync-signature'] as string | undefined) ??
      (request.headers['x-signature'] as string | undefined);

    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    if (!verifyWebhookSignature(raw, signature)) {
      request.log.warn('messaging webhook rejected: bad or missing signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const from = parsed.data.from ?? parsed.data.sender ?? parsed.data.recipient;
    const body = parsed.data.text ?? parsed.data.body ?? parsed.data.message;
    if (!from || !body) return reply.code(400).send({ error: 'Missing sender or message body' });

    const result = await messagingService.handleInbound({
      channel: parsed.data.channel ?? 'IMESSAGE',
      from,
      body,
    });

    // The reply is returned in the response so a provider that supports
    // synchronous replies can use it directly; providers that don't will
    // have had it sent via the outbound path already. Which of the two
    // applies is a provider detail — see docs/MESSAGING_BOT.md.
    return reply.send({ reply: result.text, intent: result.intent });
  });

  /**
   * Dev-only: run the inbound pipeline without a provider or a
   * signature, so the conversation logic can be exercised end to end
   * before any bridge account exists. Mirrors the Alexa integration's
   * demo-intent endpoint, and is registered only outside production for
   * the same reason.
   */
  if (env.NODE_ENV !== 'production') {
    app.post('/messaging/simulate', { preHandler: app.authenticate }, async (request, reply) => {
      const schema = z.object({ channel: z.enum(CHANNELS).default('IMESSAGE'), from: z.string(), body: z.string() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const result = await messagingService.handleInbound(parsed.data);
      return reply.send(result);
    });
  }
}
