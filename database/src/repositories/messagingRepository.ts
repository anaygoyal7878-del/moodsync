import { prisma } from '../prismaClient.js';
import type { MessagingChannel, MessagingDirection } from '@prisma/client';

/** How long a verification code stays usable. Short enough that a code
 * left on a screen isn't a standing risk, long enough to walk to your
 * phone and type it. */
const VERIFICATION_TTL_MINUTES = 15;

/**
 * Normalizes a handle so a webhook lookup can't miss on formatting.
 * Phone numbers land in a loose E.164 shape (digits with a leading `+`);
 * anything else (an Apple ID email, say) is lower-cased and trimmed.
 *
 * Deliberately NOT a full phone-number parser — this project has no
 * libphonenumber dependency and adding one for this would be
 * disproportionate. It handles the formatting users actually type
 * (spaces, dashes, parens, a leading `+` or not). A number typed
 * without a country code stays without one, and will simply fail to
 * match the webhook's E.164 handle — which surfaces as "we don't
 * recognize this number" rather than as a wrong-account match.
 */
export function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  if (/[a-zA-Z@]/.test(trimmed)) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export const messagingRepository = {
  /**
   * Starts (or restarts) a claim on a handle for this user.
   *
   * Re-claiming a handle already bound to a *different* user is
   * rejected rather than silently reassigned — otherwise anyone could
   * take over someone else's verified number by claiming it, and the
   * unique constraint alone would let the write through as an update.
   */
  async startVerification(params: { userId: string; channel: MessagingChannel; handle: string; code: string }) {
    const handle = normalizeHandle(params.handle);
    const existing = await prisma.messagingConnection.findUnique({
      where: { channel_handle: { channel: params.channel, handle } },
    });
    if (existing && existing.userId !== params.userId) return null;

    const expires = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);
    return prisma.messagingConnection.upsert({
      where: { channel_handle: { channel: params.channel, handle } },
      create: {
        userId: params.userId,
        channel: params.channel,
        handle,
        verificationCode: params.code,
        verificationExpiresAt: expires,
      },
      update: {
        verificationCode: params.code,
        verificationExpiresAt: expires,
        // Re-verifying clears a previous opt-out: the user is actively
        // asking for messages again.
        optedOutAt: null,
      },
    });
  },

  /** Confirms a code. Returns null on a wrong or expired code — the
   * caller must not distinguish the two to the sender. */
  async confirmVerification(connectionId: string, code: string) {
    const connection = await prisma.messagingConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.verificationCode || !connection.verificationExpiresAt) return null;
    if (connection.verificationCode !== code) return null;
    if (connection.verificationExpiresAt < new Date()) return null;

    return prisma.messagingConnection.update({
      where: { id: connectionId },
      data: { verifiedAt: new Date(), verificationCode: null, verificationExpiresAt: null },
    });
  },

  /** The webhook's entry point: who is this handle? */
  async findByHandle(channel: MessagingChannel, handle: string) {
    return prisma.messagingConnection.findUnique({
      where: { channel_handle: { channel, handle: normalizeHandle(handle) } },
    });
  },

  async listForUser(userId: string) {
    return prisma.messagingConnection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  },

  async setOptedOut(id: string, optedOut: boolean) {
    return prisma.messagingConnection.update({
      where: { id },
      data: { optedOutAt: optedOut ? new Date() : null },
    });
  },

  async touch(id: string, direction: MessagingDirection) {
    return prisma.messagingConnection.update({
      where: { id },
      data: direction === 'INBOUND' ? { lastInboundAt: new Date() } : { lastOutboundAt: new Date() },
    });
  },

  async disconnect(id: string, userId: string): Promise<boolean> {
    const result = await prisma.messagingConnection.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },

  async logMessage(params: {
    connectionId: string;
    userId: string;
    direction: MessagingDirection;
    body: string;
    intent?: string | null;
    externalId?: string | null;
  }) {
    return prisma.messagingMessage.create({
      data: {
        connectionId: params.connectionId,
        userId: params.userId,
        direction: params.direction,
        body: params.body,
        intent: params.intent ?? null,
        externalId: params.externalId ?? null,
      },
    });
  },

  /** Recent turns, oldest-first — what gets replayed to Clara as
   * conversation context, since a messaging channel has no client to
   * hold history the way the in-app chat does. */
  async recentHistory(connectionId: string, limit: number) {
    const rows = await prisma.messagingMessage.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  },

  /**
   * Inbound messages only, for compiling the conversation profile (see
   * ai/src/messagingProfile.ts).
   *
   * Deliberately a separate read from `recentHistory`: that one is the
   * short conversational window replayed verbatim to the model and is
   * kept small because every turn of it costs tokens. This one is a
   * wider, cheaper sample used only to *count* things — length, hour,
   * intent — and never sent to the model as text, so it can afford a
   * much longer window than the replay can.
   */
  async listInboundForProfile(connectionId: string, limit: number) {
    return prisma.messagingMessage.findMany({
      where: { connectionId, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { body: true, intent: true, createdAt: true },
    });
  },

  /** Unprompted sends in a window, across every one of this user's
   * handles — the input to the daily proactive cap. Counts by userId
   * rather than connectionId on purpose: the cap is "how often may
   * MoodSync interrupt this person", and texting the same person three
   * times on two numbers is six interruptions, not three. */
  async countProactiveSince(userId: string, since: Date): Promise<number> {
    return prisma.messagingMessage.count({
      where: { userId, direction: 'OUTBOUND', intent: 'proactive', createdAt: { gte: since } },
    });
  },

  /** Inbound count in the trailing window — the input to rate limiting,
   * so one sender can't drive unbounded model spend. */
  async countInboundSince(connectionId: string, since: Date): Promise<number> {
    return prisma.messagingMessage.count({
      where: { connectionId, direction: 'INBOUND', createdAt: { gte: since } },
    });
  },
};
