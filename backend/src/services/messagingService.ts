import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { messagingRepository, caffeineLogRepository } from '@moodsync/database';
import type { MessagingChannel } from '@moodsync/database';
import {
  classifyInbound,
  deterministicReply,
  buildStatusReply,
  buildCaffeineLogReply,
  shapeReply,
  sendAtlasMessage,
  AtlasNotConfiguredError,
  computeReadiness,
  computeLiveEnergyMeter,
  composeDailyBrief,
  timeOfDayFor,
  UNVERIFIED_REPLY,
  OPTED_OUT_REPLY,
  MESSAGING_STYLE_PROMPT,
  type AtlasChatMessage,
} from '@moodsync/ai';
import { env } from '../config/env.js';
import { loadCompanionContext, bookedHoursFrom } from './companionContext.js';

/**
 * Turns an inbound message into an outbound reply.
 *
 * The order of checks in `handleInbound` is the security design, not
 * incidental:
 *
 *   1. Unknown handle  → say nothing about any account.
 *   2. Crisis language → resources, before anything else can shadow it.
 *   3. Unverified      → prompt for the code, still reveal nothing.
 *   4. Opted out       → only START gets a response.
 *   5. Rate limit      → cheap refusal before any model call.
 *   6. Everything else → deterministic command, or grounded Atlas.
 *
 * Crisis sits above verification on purpose. Someone in distress
 * texting an unrecognized number should still get a crisis line, not
 * "please verify your account first."
 */

/** Trailing window and ceiling for inbound messages from one handle.
 * Guards against both a runaway loop and a stranger driving model spend
 * on a verified user's account. */
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_INBOUND = 15;
/** Conversation turns replayed to Atlas. Enough for a follow-up
 * question to make sense, short enough to stay cheap. */
const HISTORY_TURNS = 10;

export interface InboundMessage {
  channel: MessagingChannel;
  /** The sender's handle, as the provider reports it. */
  from: string;
  body: string;
}

export interface OutboundReply {
  /** The text to send back, or null when the correct action is silence
   * (an unknown handle sending a non-crisis message gets one reply, not
   * a conversation — see `handleInbound`). */
  text: string | null;
  intent: string;
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Verifies a provider webhook signature.
 *
 * HMAC-SHA256 over the raw body with a shared secret is the scheme every
 * bridge provider this project could plausibly use (Sendblue, LoopMessage,
 * Twilio-style) supports in some form. The exact header name differs per
 * provider, so the route passes the signature in rather than this
 * function reading it — see docs/MESSAGING_BOT.md.
 *
 * Returns false when no secret is configured: an unauthenticated webhook
 * that hands out health data is worse than a broken one.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.MESSAGING_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac('sha256', env.MESSAGING_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const messagingService = {
  async startVerification(userId: string, channel: MessagingChannel, handle: string) {
    const code = generateVerificationCode();
    const connection = await messagingRepository.startVerification({ userId, channel, handle, code });
    // null means the handle belongs to someone else — the caller turns
    // this into a generic conflict without confirming who holds it.
    return connection ? { connection, code } : null;
  },

  /**
   * The whole inbound pipeline. Returns what to send back; the caller
   * is responsible for actually dispatching it through the provider.
   */
  async handleInbound(message: InboundMessage): Promise<OutboundReply> {
    const classification = classifyInbound(message.body);
    const connection = await messagingRepository.findByHandle(message.channel, message.from);

    // 1 + 2. Unknown handle. Crisis still answers; nothing else leaks
    // whether this number is associated with an account.
    if (!connection) {
      if (classification.intent === 'crisis') {
        return { text: deterministicReply(classification), intent: 'crisis' };
      }
      return { text: UNVERIFIED_REPLY, intent: 'unknown_handle' };
    }

    await messagingRepository.logMessage({
      connectionId: connection.id,
      userId: connection.userId,
      direction: 'INBOUND',
      body: message.body,
      intent: classification.intent,
    });
    await messagingRepository.touch(connection.id, 'INBOUND');

    if (classification.intent === 'crisis') {
      return { text: deterministicReply(classification), intent: 'crisis' };
    }

    // 3. Verification. A pending connection can only do one thing.
    if (!connection.verifiedAt) {
      if (classification.intent === 'verify' && classification.code) {
        const confirmed = await messagingRepository.confirmVerification(connection.id, classification.code);
        return confirmed
          ? { text: "You're all set. Text HELP to see what I can do, or just ask me something.", intent: 'verified' }
          : { text: "That code didn't work. Codes expire after 15 minutes — generate a new one in the app.", intent: 'verify_failed' };
      }
      return { text: UNVERIFIED_REPLY, intent: 'unverified' };
    }

    // 4. Opt-out. STOP is always honored; only START comes back.
    if (classification.intent === 'stop') {
      await messagingRepository.setOptedOut(connection.id, true);
      return { text: deterministicReply(classification), intent: 'stop' };
    }
    if (connection.optedOutAt) {
      if (classification.intent === 'start') {
        await messagingRepository.setOptedOut(connection.id, false);
        return { text: deterministicReply(classification), intent: 'start' };
      }
      return { text: OPTED_OUT_REPLY, intent: 'opted_out' };
    }

    // 5. Rate limit, before any model call.
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);
    if ((await messagingRepository.countInboundSince(connection.id, since)) > RATE_MAX_INBOUND) {
      return { text: "That's a lot of messages — give me a few minutes to catch up.", intent: 'rate_limited' };
    }

    // 6a. Deterministic commands.
    const canned = deterministicReply(classification);
    if (canned) return { text: canned, intent: classification.intent };

    // 6b. Status — real numbers, no model.
    if (classification.intent === 'status') {
      return { text: await buildStatus(connection.userId), intent: 'status' };
    }

    // 6c. Health logging by text. Writes to the same CaffeineLog the
    // in-app logger uses, so a drink logged from Messages shows up in
    // the energy meter identically.
    if (classification.intent === 'log_caffeine' && classification.mg) {
      await caffeineLogRepository.create({
        userId: connection.userId,
        mg: classification.mg,
        loggedAt: new Date(),
      });
      const context = await loadCompanionContext(connection.userId);
      const energy = context.scores
        ? computeLiveEnergyMeter(
            context.scores,
            (await caffeineLogRepository.listRecentForUser(connection.userId, 5)).map((log) => ({
              mg: log.mg,
              loggedAt: log.loggedAt,
            })),
          ).value
        : null;
      return { text: buildCaffeineLogReply(classification.mg, energy), intent: 'log_caffeine' };
    }

    // 6d. Open question — the grounded Atlas path, with conversation
    // history replayed since the channel has no client holding it.
    try {
      const history = await messagingRepository.recentHistory(connection.id, HISTORY_TURNS);
      const messages: AtlasChatMessage[] = history.map((row) => ({
        role: row.direction === 'INBOUND' ? 'user' : 'assistant',
        content: row.body,
      }));
      // The style instruction rides as a final user turn rather than
      // being baked into atlasChat's system prompt — the in-app chat
      // should keep its richer formatting.
      messages.push({ role: 'user', content: `${MESSAGING_STYLE_PROMPT}\n\nMessage: ${message.body}` });

      const reply = await sendAtlasMessage(connection.userId, messages);
      return { text: shapeReply(reply), intent: 'question' };
    } catch (error) {
      if (error instanceof AtlasNotConfiguredError) {
        return { text: "I can't answer questions right now — my AI isn't configured yet.", intent: 'not_configured' };
      }
      return { text: "I couldn't work that out just now. Try again in a moment.", intent: 'error' };
    }
  },

  /** Records what was actually sent, so the thread and the audit trail
   * stay accurate even when the provider call is the part that fails. */
  async recordOutbound(connectionId: string, userId: string, body: string, externalId?: string | null) {
    await messagingRepository.logMessage({
      connectionId,
      userId,
      direction: 'OUTBOUND',
      body,
      externalId: externalId ?? null,
    });
    await messagingRepository.touch(connectionId, 'OUTBOUND');
  },
};

/** The deterministic "how am I doing" payload, from the same context
 * loader the dashboard uses — so a text and the app never disagree. */
async function buildStatus(userId: string): Promise<string> {
  const context = await loadCompanionContext(userId);
  if (!context.scores) {
    return buildStatusReply({ readiness: null, energy: null, sleep: null, focusToday: null });
  }

  const readiness = computeReadiness(context.scores);
  const brief = composeDailyBrief({
    timeOfDay: timeOfDayFor(new Date().getHours()),
    readiness: readiness.value,
    energy: context.energy,
    burnoutRisk: false,
    focusWindow: null,
    bookedHoursToday: bookedHoursFrom(context.todayEvents),
  });

  return buildStatusReply({
    readiness: readiness.value,
    energy: context.energy,
    sleep: context.scores.sleep.value,
    focusToday: brief.focusToday,
  });
}
