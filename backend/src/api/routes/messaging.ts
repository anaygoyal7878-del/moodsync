import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  messagingRepository,
  messagingSettingsRepository,
  messagingMemoryRepository,
  MAX_FACTS_PER_USER,
} from '@moodsync/database';
import { resolveMessagingCapabilities, selectMessagingTools } from '@moodsync/ai';
import { messagingService, verifyWebhookSignature } from '../../services/messagingService.js';
import { env } from '../../config/env.js';

const CHANNELS = ['IMESSAGE', 'SMS', 'WHATSAPP'] as const;

const startSchema = z.object({
  channel: z.enum(CHANNELS),
  handle: z.string().min(3).max(120),
});

/**
 * Bounds are enforced here, not only in the UI. `dailyProactiveLimit`
 * is capped server-side because it governs how often a product may
 * interrupt someone — a client must not be able to raise its own
 * ceiling to an arbitrary number.
 */
const settingsSchema = z.object({
  proactiveEnabled: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  dailyProactiveLimit: z.number().int().min(0).max(10).optional(),
  recurringNudgesEnabled: z.boolean().optional(),
  // 1-12h: below 1 is indistinguishable from a threshold-based check at
  // that point, and above 12 stops matching what a person means by
  // "remind me periodically" — same server-side-bounds-not-just-UI
  // reasoning as dailyProactiveLimit above.
  recurringNudgeIntervalHours: z.number().int().min(1).max(12).optional(),
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
const attachmentSchema = z.object({
  guid: z.string().min(1),
  // BlueBubbles' documented attachment field name; kept optional and
  // loosely typed like every other field here for the same reason —
  // not every bridge provider reports it identically.
  mimeType: z.string().optional(),
});

const webhookSchema = z.object({
  channel: z.enum(CHANNELS).optional(),
  from: z.string().min(1).optional(),
  sender: z.string().min(1).optional(),
  recipient: z.string().min(1).optional(),
  text: z.string().max(4000).optional(),
  body: z.string().max(4000).optional(),
  message: z.string().max(4000).optional(),
  // A voice message arrives with no text body and one audio attachment
  // — see ai/src/voiceTranscription.ts and
  // docs/MESSAGING_AGENTIC_ARCHITECTURE.md's voice-input section.
  attachments: z.array(attachmentSchema).optional(),
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

  /** Pause or resume a single handle from the app — the same state
   * texting STOP/START sets, reachable without having to text. */
  app.patch('/messaging/connections/:id/opted-out', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ optedOut: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Re-checked against userId rather than trusting the path id, so
    // one account can't mute another's number.
    const owned = (await messagingRepository.listForUser(request.userId!)).some((c) => c.id === id);
    if (!owned) return reply.code(404).send({ error: 'Connection not found' });

    await messagingRepository.setOptedOut(id, parsed.data.optedOut);
    return reply.code(204).send();
  });

  app.get('/messaging/settings', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send(await messagingSettingsRepository.get(request.userId!));
  });

  app.patch('/messaging/settings', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await messagingSettingsRepository.update(request.userId!, parsed.data);
    return reply.send(await messagingSettingsRepository.get(request.userId!));
  });

  /**
   * What MoodSync has remembered about this person from texting, and
   * the ability to forget any of it.
   *
   * A memory the subject can't see isn't a feature, it's a dossier —
   * and until this existed a wrong fact could only be evicted by
   * waiting for the cap to push it out (harder now that reinforcement
   * ranks eviction). See docs/MESSAGING_AGENTIC_ARCHITECTURE.md.
   */
  app.get('/messaging/memory', { preHandler: app.authenticate }, async (request, reply) => {
    const facts = await messagingMemoryRepository.listForUser(request.userId!, MAX_FACTS_PER_USER);
    return reply.send({
      facts: facts.map((f) => ({
        id: f.id,
        fact: f.fact,
        reinforcedCount: f.reinforcedCount,
        lastReinforcedAt: f.lastReinforcedAt,
      })),
      cap: MAX_FACTS_PER_USER,
    });
  });

  app.delete('/messaging/memory/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await messagingMemoryRepository.remove(request.userId!, id);
    if (removed === 0) return reply.code(404).send({ error: 'No such remembered fact' });
    return reply.code(204).send();
  });

  /**
   * What the bot can actually do for *this* account right now.
   *
   * Reads the same `resolveMessagingCapabilities` the agent itself uses
   * to build its tool surface, rather than a hardcoded feature list —
   * so this screen can never advertise an ability the agent doesn't
   * actually have this turn.
   */
  app.get('/messaging/capabilities', { preHandler: app.authenticate }, async (request, reply) => {
    const capabilities = await resolveMessagingCapabilities(request.userId!);
    const tools = selectMessagingTools(capabilities);
    return reply.send({
      hueConnected: capabilities.hueConnected,
      tools: Object.keys(tools),
    });
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
    // First attachment reported with an audio/* MIME type — a voice
    // message is the only attachment kind this pipeline understands at
    // all today; anything else (an image, a video) has nothing to
    // transcribe and is silently not treated as a voice message.
    const audioAttachment = parsed.data.attachments?.find((a) => a.mimeType?.toLowerCase().startsWith('audio/'));
    if (!from || (!body && !audioAttachment)) {
      return reply.code(400).send({ error: 'Missing sender or message content' });
    }

    const result = await messagingService.handleInbound({
      channel: parsed.data.channel ?? 'IMESSAGE',
      from,
      ...(body ? { body } : {}),
      ...(audioAttachment ? { audioAttachment: { guid: audioAttachment.guid, mimeType: audioAttachment.mimeType ?? '' } } : {}),
    });

    // handleInbound already pushed this through the configured provider
    // (BlueBubbles today) before returning. It's also included in the
    // response so a provider whose webhook contract expects a
    // synchronous reply body can use that path instead — see
    // docs/MESSAGING_BOT.md.
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
