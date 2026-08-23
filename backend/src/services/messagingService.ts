import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { messagingRepository, messagingPendingActionRepository, userTimezoneRepository } from '@moodsync/database';
import type { MessagingChannel } from '@moodsync/database';
import {
  classifyInbound,
  deterministicReply,
  shapeReply,
  sendAgenticMessage,
  executeConfirmedAction,
  AtlasNotConfiguredError,
  transcribeVoiceMessage,
  TranscriptionError,
  UNVERIFIED_REPLY,
  OPTED_OUT_REPLY,
  MESSAGING_STYLE_PROMPT,
  type AtlasChatMessage,
} from '@moodsync/ai';
import { env } from '../config/env.js';
import {
  sendBlueBubblesMessage,
  downloadBlueBubblesAttachment,
  MessagingProviderNotConfiguredError,
} from './messagingProviders/blueBubbles.js';

type MessagingConnectionRecord = NonNullable<Awaited<ReturnType<typeof messagingRepository.findByHandle>>>;

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
/** How far back the conversation profile counts. Much wider than the
 * replay window because these rows are only ever aggregated, never sent
 * to the model as text — see ai/src/messagingProfile.ts. */
const PROFILE_WINDOW_MESSAGES = 120;

export interface InboundMessage {
  channel: MessagingChannel;
  /** The sender's handle, as the provider reports it. */
  from: string;
  /** Absent for a voice-only message — see `audioAttachment`. */
  body?: string;
  /** A voice message's audio, downloaded and transcribed into `body`
   * before anything else in this pipeline runs — see
   * ai/src/voiceTranscription.ts for why transcription is a mandatory
   * first step rather than sending audio into the agentic model
   * directly. Only ever transcribed for a *known* connection — see
   * `handleInbound`'s comment on why an unrecognized sender's voice
   * message is never transcribed at all. */
  audioAttachment?: { guid: string; mimeType: string };
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
   * The whole inbound pipeline. Computes the reply, actually dispatches
   * it through the configured provider (best-effort — a send failure
   * doesn't lose the reply, see `deliverAndRecord`), and returns it so
   * a provider that supports a synchronous webhook response can also
   * use it directly.
   */
  async handleInbound(rawMessage: InboundMessage): Promise<OutboundReply> {
    const connection = await messagingRepository.findByHandle(rawMessage.channel, rawMessage.from);

    // Voice messages are never transcribed for an unrecognized number.
    // Crisis detection over text is a free regex check MoodSync can
    // afford to run even for strangers; transcription is a paid model
    // call, and transcribing on demand for anyone who can reach the
    // webhook would be an open-ended cost/abuse surface. This is a
    // real, narrower safety guarantee than text messages get from an
    // unknown sender — disclosed, not silent, see
    // docs/MESSAGING_AGENTIC_ARCHITECTURE.md's voice-input section.
    if (!connection && !rawMessage.body && rawMessage.audioAttachment) {
      return { text: UNVERIFIED_REPLY, intent: 'unknown_handle' };
    }

    let body = rawMessage.body;
    if (!body && rawMessage.audioAttachment && connection) {
      try {
        const downloaded = await downloadBlueBubblesAttachment(rawMessage.audioAttachment.guid);
        body = await transcribeVoiceMessage(downloaded);
      } catch (error) {
        const text =
          error instanceof TranscriptionError
            ? "I couldn't understand that voice message — try sending it as text, or a different format."
            : "I couldn't process that voice message just now.";
        // Logged with a placeholder, not the (nonexistent) transcript —
        // never fabricate what the audit trail says was said.
        await messagingRepository.logMessage({
          connectionId: connection.id,
          userId: connection.userId,
          direction: 'INBOUND',
          body: '[voice message — could not transcribe]',
          intent: 'voice_transcription_failed',
        });
        await messagingRepository.touch(connection.id, 'INBOUND');
        const reply = { text, intent: 'voice_transcription_failed' };
        await deliverAndRecord(connection, reply);
        return reply;
      }
    }

    // Reachable only for a malformed request the route's own validation
    // should already have rejected (neither text nor a transcribable
    // voice message) — handled here too rather than trusting that
    // upstream check alone.
    if (!body) return { text: null, intent: 'empty_message' };

    // The transcript (or the original text) now enters the exact same
    // pipeline a typed message always has — nothing below this line
    // knows or needs to know a message ever wasn't text.
    const message: InboundMessage & { body: string } = { ...rawMessage, body };
    const classification = classifyInbound(message.body);

    // 1 + 2. Unknown handle. Crisis still answers; nothing else leaks
    // whether this number is associated with an account. There's no
    // connection to log against or send through here, so this is the
    // one path that returns directly rather than through the epilogue.
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

    const reply = await resolveReply(message, connection, classification);
    await deliverAndRecord(connection, reply);
    return reply;
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

/** Everything after the connection is known and the inbound message is
 * logged — split out purely so `handleInbound` has one epilogue instead
 * of a send+log call duplicated at every return point. */
async function resolveReply(
  message: InboundMessage & { body: string },
  connection: MessagingConnectionRecord,
  classification: ReturnType<typeof classifyInbound>,
): Promise<OutboundReply> {
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

  // 4b. A pending confirmable action from a previous turn — see
  // docs/MESSAGING_AGENTIC_ARCHITECTURE.md. Checked ahead of normal
  // classification because "yes" here means "do the thing I proposed
  // last turn," not the START opt-in word classifyInbound would
  // otherwise read it as. A reply that's neither yes nor no falls
  // through to normal handling and leaves the pending action in place
  // to expire on its own TTL, rather than being force-cleared by an
  // unrelated message.
  const pending = await messagingPendingActionRepository.findActive(connection.id);
  if (pending) {
    const body = message.body.trim().toLowerCase();
    if (AFFIRMATIVE.test(body)) {
      await messagingPendingActionRepository.clear(connection.id);
      try {
        const args = JSON.parse(pending.argsJson) as Record<string, unknown>;
        const resultText = await executeConfirmedAction(connection.userId, pending.toolName, args);
        return { text: resultText, intent: 'action_confirmed' };
      } catch (error) {
        const text = error instanceof Error ? error.message : 'That failed — try again.';
        return { text, intent: 'action_failed' };
      }
    }
    if (NEGATIVE.test(body)) {
      await messagingPendingActionRepository.clear(connection.id);
      return { text: 'Okay, cancelled.', intent: 'action_cancelled' };
    }
  }

  // 5. Rate limit, before any model call.
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);
  if ((await messagingRepository.countInboundSince(connection.id, since)) > RATE_MAX_INBOUND) {
    return { text: "That's a lot of messages — give me a few minutes to catch up.", intent: 'rate_limited' };
  }

  // 6a. Deterministic commands — only ever fires for `help` at this
  // point in the flow (crisis/stop/start are handled earlier). Status
  // and caffeine logging used to short-circuit here too; both now go
  // through the model at 6b, via get_wearable_snapshot (with a real
  // readiness figure) and log_caffeine_intake respectively — real
  // numbers either way, but routed through judgment instead of a
  // regex, so a phrasing the classifier doesn't recognize still works.
  const canned = deterministicReply(classification);
  if (canned) return { text: canned, intent: classification.intent };

  // 6b. Everything else — the agentic Atlas path (real tool calls for
  // wearable data + readiness, smart home, caffeine logging, durable
  // memory, and nutrition guidance — see
  // docs/MESSAGING_AGENTIC_ARCHITECTURE.md), with conversation history
  // replayed since the channel has no client holding it.
  try {
    // Two different windows on the same log, for two different jobs:
    // `recentHistory` is replayed to the model verbatim (so it stays
    // short — every turn costs tokens), while `listInboundForProfile`
    // is a wider sample that only ever gets *counted*, never sent as
    // text. See ai/src/messagingProfile.ts.
    const [history, profileHistory, timeZone] = await Promise.all([
      messagingRepository.recentHistory(connection.id, HISTORY_TURNS),
      messagingRepository.listInboundForProfile(connection.id, PROFILE_WINDOW_MESSAGES),
      userTimezoneRepository.getTimezone(connection.userId).catch(() => 'UTC'),
    ]);
    const messages: AtlasChatMessage[] = history.map((row) => ({
      role: row.direction === 'INBOUND' ? 'user' : 'assistant',
      content: row.body,
    }));
    // The style instruction rides as a final user turn rather than
    // being baked into the system prompt — the in-app chat should keep
    // its richer formatting.
    messages.push({ role: 'user', content: `${MESSAGING_STYLE_PROMPT}\n\nMessage: ${message.body}` });

    const reply = await sendAgenticMessage(connection.userId, messages, {
      inboundHistory: profileHistory,
      timeZone,
    });
    if (reply.pendingAction) {
      await messagingPendingActionRepository.set({
        connectionId: connection.id,
        userId: connection.userId,
        toolName: reply.pendingAction.toolName,
        args: reply.pendingAction.args,
        promptText: reply.pendingAction.confirmPrompt,
      });
      return { text: reply.pendingAction.confirmPrompt, intent: 'action_proposed' };
    }
    return { text: shapeReply(reply.text), intent: 'question' };
  } catch (error) {
    if (error instanceof AtlasNotConfiguredError) {
      return { text: "I can't answer questions right now — my AI isn't configured yet.", intent: 'not_configured' };
    }
    return { text: "I couldn't work that out just now. Try again in a moment.", intent: 'error' };
  }
}

/** Casual confirm/cancel wording — deliberately looser than
 * classifyInbound's carrier-standard START/STOP word lists, since these
 * only ever apply when a specific pending action is already on the
 * table (checked by the caller before either regex runs). */
const AFFIRMATIVE = /^(yes|y|yeah|yep|yup|confirm|do it|go ahead|sure|ok|okay)\b/i;
const NEGATIVE = /^(no|n|nope|nah|cancel|never ?mind)\b/i;

/**
 * Actually pushes the reply through the configured provider, then logs
 * whatever happened either way.
 *
 * A provider failure must never lose the reply from the audit trail —
 * the message a user *should* have received is still recorded, with no
 * externalId, so support can tell "we never sent this" apart from
 * "nothing to send." BlueBubbles is the only provider wired today (see
 * docs/MESSAGING_BOT.md); a webhook that supports a synchronous reply
 * in its own response still gets one from the route regardless of
 * whether this push also fires, so a provider switch never means a
 * silent regression to no replies at all.
 */
async function deliverAndRecord(connection: MessagingConnectionRecord, reply: OutboundReply): Promise<void> {
  if (!reply.text) return;

  let externalId: string | null = null;
  if (env.MESSAGING_SEND_URL && env.MESSAGING_API_KEY && connection.channel !== 'WHATSAPP') {
    try {
      const result = await sendBlueBubblesMessage(connection.handle, reply.text);
      externalId = result.externalId;
    } catch (error) {
      if (!(error instanceof MessagingProviderNotConfiguredError)) {
        console.error('messaging: outbound send failed', { connectionId: connection.id, error });
      }
    }
  }

  await messagingRepository.logMessage({
    connectionId: connection.id,
    userId: connection.userId,
    direction: 'OUTBOUND',
    body: reply.text,
    externalId,
  });
  await messagingRepository.touch(connection.id, 'OUTBOUND');
}
