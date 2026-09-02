import { messagingRepository, messagingSettingsRepository, userTimezoneRepository, type MessagingSettings } from '@moodsync/database';
import { buildProactiveNudge } from './messagingAgent.js';

export type ProactiveBlockReason = 'disabled' | 'quiet_hours' | 'daily_limit_reached' | 'no_connections';

export interface ProactiveDecision {
  allowed: boolean;
  reason: ProactiveBlockReason | null;
}

/**
 * Whether MoodSync may text this person right now, unprompted.
 *
 * Pure and exported so the interruption policy is testable without a
 * database, a clock, or a phone. Every branch is a reason to stay
 * quiet: this function's job is to say no, and the caller only sends
 * when it has run out of reasons to.
 *
 * The asymmetry with `handleInbound` is deliberate. Replying to someone
 * who texted first needs almost no permission; interrupting someone who
 * didn't needs all of it.
 */
export function canSendProactive(
  settings: MessagingSettings,
  localHour: number,
  sentToday: number,
  connectionCount: number,
): ProactiveDecision {
  if (!settings.proactiveEnabled) return { allowed: false, reason: 'disabled' };
  if (connectionCount === 0) return { allowed: false, reason: 'no_connections' };
  if (sentToday >= settings.dailyProactiveLimit) return { allowed: false, reason: 'daily_limit_reached' };
  if (withinQuietHours(localHour, settings.quietHoursStart, settings.quietHoursEnd)) {
    return { allowed: false, reason: 'quiet_hours' };
  }
  return { allowed: true, reason: null };
}

/**
 * Half-open [start, end): a 22→7 window covers 22:00 through 06:59 and
 * releases at 07:00, so "quiet until 7" means the 7am brief still
 * lands. Wrap-around across midnight is the common case here, not an
 * edge case — quiet hours that don't cross midnight are the unusual
 * ones.
 */
export function withinQuietHours(hour: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null) return false;
  // A zero-width window (start === end) is treated as "no quiet hours"
  // rather than "always quiet" — the latter would silently mute every
  // proactive message from a setting that reads like a no-op.
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function localHourIn(timeZone: string, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

/** Midnight local, as an instant — the boundary the daily cap counts
 * from. A rolling 24h window would let a burst at 11pm block the next
 * morning's brief, which is not what "3 a day" means to a person. */
function startOfLocalDay(timeZone: string, now: Date): Date {
  return new Date(now.getTime() - localHourIn(timeZone, now) * 3_600_000 - (now.getMinutes() * 60 + now.getSeconds()) * 1000);
}

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
 * `claraChat.ts` already reads `GEMINI_API_KEY` in this package rather
 * than through a zod schema (that validation lives in the backend app
 * only). See docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md.
 */
export async function sendProactiveInsight(
  userId: string,
  title: string,
  body: string,
  now: Date = new Date(),
): Promise<{ sent: number; blocked: ProactiveBlockReason | null }> {
  const connections = (await messagingRepository.listForUser(userId)).filter(
    (c) => c.verifiedAt && !c.optedOutAt && c.channel !== 'WHATSAPP',
  );

  const [settings, timeZone] = await Promise.all([
    messagingSettingsRepository.get(userId),
    userTimezoneRepository.getTimezone(userId).catch(() => 'UTC'),
  ]);
  const sentToday = await messagingRepository.countProactiveSince(userId, startOfLocalDay(timeZone, now));

  const decision = canSendProactive(settings, localHourIn(timeZone, now), sentToday, connections.length);
  if (!decision.allowed) return { sent: 0, blocked: decision.reason };

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
    // Tagged `proactive` so countProactiveSince can enforce the daily
    // cap. An untagged send would make the cap notional.
    await messagingRepository.logMessage({
      connectionId: connection.id,
      userId,
      direction: 'OUTBOUND',
      body: text,
      intent: 'proactive',
      externalId,
    });
    await messagingRepository.touch(connection.id, 'OUTBOUND');
    sent++;
  }

  return { sent, blocked: null };
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
    throw new Error(`BlueBubbles send failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
  const payload = (await response.json().catch(() => null)) as { data?: { guid?: string } } | null;
  return payload?.data?.guid ?? null;
}
