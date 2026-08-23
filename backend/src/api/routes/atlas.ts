import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendAgenticMessage, executeConfirmedAction, AtlasNotConfiguredError, type AtlasChatMessage } from '@moodsync/ai';

/** Capped well under Gemini's real context window — this is a sanity
 * bound on request size, not a claim about model limits. */
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

const confirmSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

/**
 * Atlas — the in-app conversational interface to the same intelligence
 * engine the iMessage bot runs on (`ai/src/agenticMessaging.ts`), not a
 * separate, lesser chatbot. This used to call the older
 * `sendAtlasMessage` (grounded read-only Q&A, no tools) — real data in
 * the answers, but no way to actually act on a recommendation from the
 * chat itself, which is the opposite of what "the conversational
 * interface to the MoodSync intelligence engine" is supposed to mean.
 * Switching to `sendAgenticMessage` gives this surface the same real
 * tool-calling — reading wearable data, controlling Hue, logging
 * caffeine, proposing a calendar event, remembering a durable fact —
 * that the messaging bot already had. See
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md.
 *
 * One real architectural difference from the phone channel: this chat
 * is stateless server-side (no server-side conversation persistence —
 * a real, disclosed scope limit, not a bug: refreshing the page starts
 * over) and has no `MessagingConnection`/`MessagingPendingAction` row
 * to hold a proposed action between messages. The browser holds that
 * instead — an action proposal comes back as structured `pendingAction`
 * data in the chat response (not just text), and confirming it is a
 * second, explicit request to `/atlas/actions/confirm` carrying the
 * exact tool name and args the client was shown. `executeConfirmedAction`
 * re-validates them from scratch regardless (a target could have been
 * renamed or disconnected in the meantime) — same safety property as
 * the phone channel's `MessagingPendingAction`, achieved without
 * needing a server-side row for it.
 */
export default async function atlasRoutes(app: FastifyInstance) {
  app.post('/atlas/chat', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const result = await sendAgenticMessage(request.userId!, parsed.data.messages as AtlasChatMessage[]);
      if (result.pendingAction) {
        return reply.send({
          reply: result.pendingAction.confirmPrompt,
          pendingAction: { toolName: result.pendingAction.toolName, args: result.pendingAction.args },
        });
      }
      return reply.send({ reply: result.text, pendingAction: null });
    } catch (error) {
      if (error instanceof AtlasNotConfiguredError) {
        return reply.code(503).send({ error: 'Atlas is not configured yet — ask the site owner to add a GEMINI_API_KEY.' });
      }
      request.log.error(error, 'Atlas chat request failed');
      return reply.code(502).send({ error: "Atlas couldn't respond right now — try again in a moment." });
    }
  });

  /** Executes a previously-proposed action tool the user just confirmed
   * in the chat UI. See this file's top comment for why confirmation
   * here carries the tool name/args explicitly rather than referencing
   * a server-stored pending action the way the phone channel does. */
  app.post('/atlas/actions/confirm', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const resultText = await executeConfirmedAction(request.userId!, parsed.data.toolName, parsed.data.args);
      return reply.send({ reply: resultText });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That failed — try again.';
      return reply.code(422).send({ error: message });
    }
  });
}
