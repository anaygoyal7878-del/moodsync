import { prisma } from '../prismaClient.js';

/** How long a confirmation stays live. Long enough to read a text and
 * reply, short enough that a stale "turn off the lights?" from an hour
 * ago can't be confirmed out of context by an unrelated later message. */
const PENDING_ACTION_TTL_MINUTES = 5;

export const messagingPendingActionRepository = {
  /** One pending action per connection — a new call replaces whatever
   * was pending (see the model's doc comment in schema.prisma for why
   * queuing multiple would be worse). */
  async set(params: { connectionId: string; userId: string; toolName: string; args: unknown; promptText: string }) {
    const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MINUTES * 60_000);
    return prisma.messagingPendingAction.upsert({
      where: { connectionId: params.connectionId },
      create: {
        connectionId: params.connectionId,
        userId: params.userId,
        toolName: params.toolName,
        argsJson: JSON.stringify(params.args),
        promptText: params.promptText,
        expiresAt,
      },
      update: {
        toolName: params.toolName,
        argsJson: JSON.stringify(params.args),
        promptText: params.promptText,
        createdAt: new Date(),
        expiresAt,
      },
    });
  },

  /** Returns the pending action only if it hasn't expired — an expired
   * row is left in place (harmless audit trail) rather than deleted
   * here, since deleting on read would need a write on every check. */
  async findActive(connectionId: string) {
    const pending = await prisma.messagingPendingAction.findUnique({ where: { connectionId } });
    if (!pending || pending.expiresAt < new Date()) return null;
    return pending;
  },

  async clear(connectionId: string) {
    await prisma.messagingPendingAction.deleteMany({ where: { connectionId } });
  },
};
