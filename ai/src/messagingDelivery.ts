import { messagingRepository } from '@moodsync/database';
import { buildProactiveNudge } from './messagingAgent.js';

/**
 * Sends a proactive health insight as a text, from wherever a real
 * insight was just generated (today: `workers/src/proactiveNotificationsWorker.ts`,
 * the same tick that already creates the in-app notification).
 *
 * This package (like `workers`) can't reach into the backend app's
 * internals — same rationale as `hueActionExecutor.ts`'s Hue-token
 * comment — so the BlueBubbles send call is duplicated in miniature
 * here rather than imported from `backend/src/services/messagingProviders/blueBubbles.ts`.
 * Config is read directly from `process.env`, matching how
 * `atlasChat.ts` already reads `GEMINI_API_KEY` in this package rather
 * than through a zod schema (that validation lives in the backend app
 * only). See docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md.
 */
export async function sendProactiveInsight(userId: string, title: string, body: string): Promise<{ sent: number }> {
  const connections = (await messagingRepository.listForUser(userId)).filter(
    (c) => c.verifiedAt && !c.optedOutAt && c.channel !== 'WHATSAPP',
  );
  if (connections.length === 0) return { sent: 0 };

  const text = buildProactiveNudge(title, body);
  let sent = 0;

  for (const connection of connections) {
    let externalId: string | null = null;
    const sendUrl = process.env.MESSAGING_SEND_URL;
    const apiKey = process.env.MESSAGING_API_KEY;
    if (sendUrl && apiKey) {
      try {
        externalId = await sendBlueBubblesText(sendUrl, apiKey, connection.handle, text);
      } catch (error) {
        console.error('messagingDelivery: proactive send failed', { connectionId: connection.id, error });
      }
    }
    // Logged regardless of send success — same "never lose the message
    // from the audit trail" principle as backend's deliverAndRecord.
    await messagingRepository.logMessage({ connectionId: connection.id, userId, direction: 'OUTBOUND', body: text, externalId });
    await messagingRepository.touch(connection.id, 'OUTBOUND');
    sent++;
  }

  return { sent };
}

/** Miniature duplicate of backend's BlueBubbles client — see this
 * file's top comment for why. Kept intentionally smaller: no
 * `MessagingProviderNotConfiguredError`, since the caller already
 * checked both env vars are set before calling this. */
async function sendBlueBubblesText(baseUrl: string, password: string, handle: string, message: string): Promise<string | null> {
  const url = new URL('/api/v1/message/text', baseUrl);
  url.searchParams.set('password', password);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatGuid: `iMessage;-;${handle}`,
      tempGuid: `moodsync-proactive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      method: 'private-api',
    }),
  });

  if (!response.ok) {
    throw new Error(`BlueBubbles send failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
  const payload = (await response.json().catch(() => null)) as { data?: { guid?: string } } | null;
  return payload?.data?.guid ?? null;
}
