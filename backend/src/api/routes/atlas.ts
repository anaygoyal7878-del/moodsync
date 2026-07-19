import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendAtlasMessage, AtlasNotConfiguredError, type AtlasChatMessage } from '@moodsync/ai';

/** Capped well under Claude's real context window — this is a sanity
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

/**
 * Atlas — MoodSync's AI wellness assistant. One stateless endpoint: the
 * client sends its full message history each turn (see
 * frontend/src/components/dashboard/atlas/AtlasChat.tsx), Atlas replies
 * grounded in this user's real data via ai/src/atlasChat.ts. No
 * server-side conversation persistence yet — a real, disclosed scope
 * limit, not a bug: refreshing the page starts a new conversation.
 */
export default async function atlasRoutes(app: FastifyInstance) {
  app.post('/atlas/chat', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const reply_ = await sendAtlasMessage(request.userId!, parsed.data.messages as AtlasChatMessage[]);
      return reply.send({ reply: reply_ });
    } catch (error) {
      if (error instanceof AtlasNotConfiguredError) {
        return reply.code(503).send({ error: 'Atlas is not configured yet — ask the site owner to add an ANTHROPIC_API_KEY.' });
      }
      request.log.error(error, 'Atlas chat request failed');
      return reply.code(502).send({ error: "Atlas couldn't respond right now — try again in a moment." });
    }
  });
}
