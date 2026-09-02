import { env } from '../../config/env.js';

export class MessagingProviderNotConfiguredError extends Error {}

export interface ProviderSendResult {
  /** The provider's own message id, when it returns one — stored on the
   * outbound row for reconciliation, not required for the send to count. */
  externalId: string | null;
}

/**
 * BlueBubbles Server REST API client.
 *
 * BlueBubbles is the self-hosted path docs/MESSAGING_BOT.md recommends
 * starting with: free, no business registration, exposes a plain REST
 * API from a Mac the user already owns. This wraps `POST
 * /api/v1/message/text`, documented at
 * https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks.
 *
 * The chat GUID is constructed directly as `iMessage;-;<handle>` (the
 * documented direct-message addressing convention) rather than resolved
 * via a `/api/v1/chat/query` lookup — one request instead of two, at the
 * cost of assuming the handle already has (or BlueBubbles will create) a
 * 1:1 iMessage thread. No live BlueBubbles server was available to
 * round-trip this integration, so treat the exact response shape as
 * best-effort until it has actually been run against a real instance —
 * see the "Known gaps" section of docs/MESSAGING_BOT.md.
 */
export async function sendBlueBubblesMessage(handle: string, message: string): Promise<ProviderSendResult> {
  if (!env.MESSAGING_SEND_URL || !env.MESSAGING_API_KEY) {
    throw new MessagingProviderNotConfiguredError('MESSAGING_SEND_URL and MESSAGING_API_KEY must both be set');
  }

  const url = new URL('/api/v1/message/text', env.MESSAGING_SEND_URL);
  url.searchParams.set('password', env.MESSAGING_API_KEY);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatGuid: `iMessage;-;${handle}`,
      tempGuid: `moodsync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      // Deliberately omitted rather than pinned to 'private-api'.
      //
      // BlueBubbles picks the send method itself, and its own server
      // code is explicit about the rule:
      //
      //   papiEnabled && !!Server().privateApi.helper
      //     ? "private-api" : "apple-script"
      //
      // Pinning 'private-api' demands a path that only exists when the
      // Private API helper bundle is installed, which requires System
      // Integrity Protection to be disabled. On a normal Mac — SIP on,
      // no helper — that request cannot be satisfied, and hardcoding it
      // turned "iMessage works with a small feature gap" into "iMessage
      // does not work at all".
      //
      // Letting the server choose means AppleScript delivery on a
      // stock Mac and Private API automatically on a machine set up for
      // it, with no config change either way. The AppleScript path
      // sends plain text fine; what it gives up is tapbacks, effects
      // and edits — none of which MoodSync sends.
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`BlueBubbles send failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json().catch(() => null)) as { data?: { guid?: string } } | null;
  return { externalId: payload?.data?.guid ?? null };
}

export interface DownloadedAttachment {
  data: Buffer;
  mimeType: string;
}

/**
 * Downloads an inbound attachment (a voice message, for
 * `create_calendar_event`'s sibling feature — see
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md's voice-input section) via
 * BlueBubbles' documented `GET /api/v1/attachment/<guid>/download`
 * endpoint. Same no-live-server caveat as `sendBlueBubblesMessage`: the
 * response shape here is best-effort against BlueBubbles' published
 * docs, not round-tripped against a real instance.
 *
 * The `mimeType` returned is whatever the server reports via the
 * response's `Content-Type` header — trusted, not guessed from the
 * filename, since a wrong guess here would silently mislabel audio
 * `transcribeVoiceMessage` then rejects or mishandles.
 */
export async function downloadBlueBubblesAttachment(guid: string): Promise<DownloadedAttachment> {
  if (!env.MESSAGING_SEND_URL || !env.MESSAGING_API_KEY) {
    throw new MessagingProviderNotConfiguredError('MESSAGING_SEND_URL and MESSAGING_API_KEY must both be set');
  }

  const url = new URL(`/api/v1/attachment/${guid}/download`, env.MESSAGING_SEND_URL);
  url.searchParams.set('password', env.MESSAGING_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`BlueBubbles attachment download failed: ${response.status}`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const data = Buffer.from(await response.arrayBuffer());
  return { data, mimeType };
}
