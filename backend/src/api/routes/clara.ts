import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendAgenticMessage, executeConfirmedAction, ClaraNotConfiguredError, type ClaraChatMessage } from '@moodsync/ai';

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
 * Clara's stateless HTTP surface — the same intelligence engine the
 * messaging channel runs on (`ai/src/agenticMessaging.ts`), reachable
 * as a request/response API instead of over a phone number.
 *
 * **Clara's product surface is messaging, not the web.** The in-app
 * chat panel these two endpoints were built for has been removed, so
 * nothing in this repo calls them today. They are kept deliberately:
 * they are the engine's API boundary and its only direct test coverage
 * (clara.test.ts), and anything wanting a non-SMS Clara — the iOS
 * companion, a future surface — should talk to these rather than reach
 * into the `ai` package directly. See docs/CLARA_ARCHITECTURE.md.
 *
 * One real architectural difference from the phone channel: this path
 * is stateless server-side (no conversation persistence — the caller
 * replays history) and has no `MessagingConnection`/
 * `MessagingPendingAction` row to hold a proposed action between turns.
 * The caller holds it instead — an action proposal comes back as
 * structured `pendingAction` data (not just text), and confirming it is
 * a second, explicit request to `/clara/actions/confirm` carrying the
 * exact tool name and args the caller was shown. `executeConfirmedAction`
 * re-validates them from scratch regardless (a target could have been
 * renamed or disconnected in the meantime) — same safety property as
 * the phone channel's `MessagingPendingAction`, achieved without
 * needing a server-side row for it.
 */
export default async function claraRoutes(app: FastifyInstance) {
  app.post('/clara/chat', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const result = await sendAgenticMessage(request.userId!, parsed.data.messages as ClaraChatMessage[]);
      if (result.pendingAction) {
        return reply.send({
          reply: result.pendingAction.confirmPrompt,
          pendingAction: { toolName: result.pendingAction.toolName, args: result.pendingAction.args },
        });
      }
      return reply.send({ reply: result.text, pendingAction: null });
    } catch (error) {
      if (error instanceof ClaraNotConfiguredError) {
        return reply.code(503).send({ error: 'Clara is not configured yet — ask the site owner to add a GEMINI_API_KEY.' });
      }
      request.log.error(error, 'Clara chat request failed');
      return reply.code(502).send({ error: "Clara couldn't respond right now — try again in a moment." });
    }
  });

  /** Executes an action tool the caller previously proposed and the
   * user confirmed. See this file's top comment for why confirmation
   * here carries the tool name/args explicitly rather than referencing
   * a server-stored pending action the way the phone channel does. */
  app.post('/clara/actions/confirm', { preHandler: app.authenticate }, async (request, reply) => {
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
