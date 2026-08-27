# MoodSync over Messaging (the "iMessage bot")

Text MoodSync a question and get an answer grounded in your real data.
Text it "just had a coffee" and it logs. It texts *you* when a real
signal fires — unusually high recovery, burnout risk stacking up — the
same "Poke, but health-focused" proactive behavior described in full in
docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md. It can also read wearable
data, control a connected Hue light (with confirmation), and give
general nutrition guidance — see docs/MESSAGING_AGENTIC_ARCHITECTURE.md.

## The platform reality, researched before building

**Apple publishes no public iMessage API.** There is no SDK, no
developer program, and no supported way for a server to send a blue
bubble. Verified live against Apple's own developer resources and
current provider documentation (August 2026). Everything below follows
from that.

There are exactly three ways to reach iMessage, and they are very
different products:

### 1. Apple Messages for Business — official, gated

Apple's real, supported channel. Customers message *your business* from
Maps, Safari, Search, or a link.

Requirements, per Apple Business Register:
- You must be a **registered business**, not an individual.
- You must go through an **Apple-approved Messaging Service Provider
  (MSP)** — or become one, which requires Apple to approve your platform
  against a feature checklist (send/receive text, international
  characters and emoji, attachments up to 100MB, tapback reactions,
  closed-conversation notices, rich links, quick replies).
- Apple reviews and approves the brand account.

**Verdict for MoodSync today:** not viable for a solo developer. It is
the right answer if MoodSync becomes a company with a support function.

### 2. Third-party bridges — practical, unofficial

Sendblue, LoopMessage, Blooio and similar run fleets of Macs signed into
Apple IDs and relay REST calls through the real Messages app. They give
you a normal HTTP API and webhooks.

- Paid, from roughly $39/mo.
- LoopMessage additionally wants a DUNS number and a sending warm-up.
- These operate outside Apple's terms. That is a business risk to weigh,
  not a technical blocker.

### 3. BlueBubbles — self-hosted, free ← **recommended to start**

[BlueBubbles](https://github.com/BlueBubblesApp/bluebubbles-server) is
open source. You run its server on **a Mac you own that stays on**,
signed into your Apple ID. It exposes:

- a REST API (`POST /api/v1/message/text` to send), and
- **webhooks** — it POSTs to your URL on every new message.

That is exactly the shape this integration expects, it costs nothing,
and it needs no business registration. It is the fastest way to have a
working iMessage bot today. The tradeoff is that you are running the
infrastructure and it is tied to one Apple ID.

### Not a path: iMessage app extensions

`MSMessagesAppViewController` (an iOS app extension inside Messages) is
Apple-sanctioned but is a **UI surface in the compose area**, not a bot.
It cannot receive arbitrary inbound texts or reply on your behalf. Wrong
tool for this.

## What was built

The transport is a seam, on purpose — given the above, the provider is
expected to change.

```
provider webhook ──► POST /api/messaging/webhook  (HMAC-verified)
                          │
                          ▼
                  messagingService.handleInbound
                          │
                          ▼
                  ai/src/messagingAgent.ts   ← knows no provider
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      deterministic reply       Clara (grounded chat)
```

`ai/src/messagingAgent.ts` is channel-agnostic and pure — it is the part
worth keeping if every transport below it is replaced.

### Setup with BlueBubbles

1. Install BlueBubbles Server on an always-on Mac; sign into the Apple
   ID the bot should text from.
2. Set `MESSAGING_WEBHOOK_SECRET`, `MESSAGING_SEND_URL`,
   `MESSAGING_API_KEY` in `.env`.
3. Point a BlueBubbles webhook at `POST /api/messaging/webhook`.
4. In MoodSync → Settings → Connections, add your number and text back
   the 6-digit code.

Before any of that, `POST /api/messaging/simulate` (dev-only,
authenticated) runs the whole inbound pipeline with no provider at all,
so the conversation logic can be exercised immediately.

### Outbound sending

`backend/src/services/messagingProviders/blueBubbles.ts` wraps
BlueBubbles' `POST /api/v1/message/text`. It constructs the chat GUID
directly as `iMessage;-;<handle>` (BlueBubbles' documented direct-message
addressing convention) rather than resolving it via a `/api/v1/chat/query`
lookup first — one request instead of two.

`messagingService.handleInbound` calls this after computing every reply,
whenever `MESSAGING_SEND_URL`/`MESSAGING_API_KEY` are set and the
connection's channel isn't WhatsApp. A send failure never drops the
reply from the conversation log — it's recorded with `externalId: null`
either way, so "we computed a reply but never sent it" stays visible in
the audit trail rather than silently disappearing. This has not been
round-tripped against a real BlueBubbles server (none was available in
this environment) — the request shape follows BlueBubbles' published
docs but hasn't been confirmed by an actual send.

## Security: the order of checks is the design

`handleInbound` evaluates in this order, and the order matters:

1. **Unknown handle** → reveals nothing about any account.
2. **Crisis language** → resources, before anything can shadow it.
3. **Unverified** → prompts for the code, still reveals nothing.
4. **Opted out** → only START gets a reply.
5. **Rate limit** → cheap refusal before any model call.
6. **Everything else** → deterministic command, or grounded Clara.

**Crisis sits above verification deliberately.** Someone in distress
texting an unrecognized number should get a crisis line, not "please
verify your account first."

**Identity is the whole auth story.** Anyone can text a number claiming
to be anyone, so `MessagingConnection` is worthless until `verifiedAt`
is set — which only happens when a code shown inside an authenticated
app session is texted back. `@@unique([channel, handle])` guarantees one
handle can never resolve to two users.

Claiming a handle already bound to another user is **rejected, not
reassigned** — otherwise anyone could take over a verified number. The
API returns a generic error rather than confirming the handle is taken,
so it can't be used to enumerate which numbers have MoodSync accounts.

## Safety

**Crisis detection** (`CRISIS_PATTERNS`) is a **blunt keyword filter,
not clinical triage**, and is biased toward false positives on purpose:
a crisis line shown to someone being figurative costs one message; a
missed disclosure costs far more. On a match the bot returns a fixed
message with 988 and findahelpline.com — no model in the loop, no
wellness tip. Tests cover both real disclosures and figurative
near-misses ("this workout is killing me", "I'd kill for a coffee").

**US-centric, and stated as such.** 988 is US-only; the copy points
elsewhere to findahelpline.com rather than implying global coverage.
Proper per-region resources are real unbuilt work.

**Not medical advice.** HELP says so, and the messaging style prompt
instructs Clara not to diagnose.

**Opt-out** honours the carrier-standard words (STOP, UNSUBSCRIBE,
CANCEL, QUIT, END). Opting out keeps the row so a later START restores
the same binding. Every proactive nudge ends with the opt-out line.

**Rate limit:** 15 inbound per 10 minutes per handle, checked before any
model call, so neither a loop nor a stranger can drive model spend.

## Health features

| Text | What happens |
|---|---|
| "how am I doing" | Readiness / energy / sleep from the same context loader the dashboard uses — no model, so a text and the app can't disagree |
| "just had a coffee" | Writes a real `CaffeineLog` (~95mg) and replies with the resulting energy |
| "what's my heart rate / recovery / sleep score" | Agentic Clara calls `get_wearable_snapshot` — same wearable data as above, model-composed |
| "turn off the bedroom light" / "set living room to 40%" | Agentic Clara resolves the real light via `list_smart_home_devices`, then asks to confirm before anything changes — see docs/MESSAGING_AGENTIC_ARCHITECTURE.md |
| "activate the relax scene" | Same confirm-then-execute path, for Hue scenes |
| "what should I eat before a workout" | General nutrition guidance, grounded in real caffeine/energy data where relevant — not a personalized meal plan (MoodSync has no food-logging feature) |
| "why am I so tired?" | Clara, grounded in this account's real data |
| HELP / STOP / START | Deterministic |

Caffeine logging only fires on a **reporting** verb and not on an
intention. "I need to stop drinking coffee so late" contains both
"drinking" and "coffee" but is a resolution — logging 95mg there would
corrupt the energy meter with a drink never had. That false positive was
caught by a test, not by inspection.

## Known gaps

- **Proactive nudges are built but not scheduled.** `buildProactiveNudge`
  exists and burnout detection already runs in
  `workers/src/proactiveNotificationsWorker.ts`; hooking that worker to
  the messaging send path is a small, unbuilt step.
- **Not verified against a real provider.** No Postgres or bridge
  account was available in this environment, so the pipeline is
  unit-tested and type-checked but has not round-tripped a real message.
- **US crisis resources only** (above).

## Sources

- [Apple Messages for Business — MSP onboarding](https://register.apple.com/resources/messages/msp-onboarding/integration)
- [Apple Messages for Business REST API](https://register.apple.com/resources/messages/msp-rest-api/)
- [BlueBubbles Server (GitHub)](https://github.com/BlueBubblesApp/BlueBubbles-server)
- [Sendblue — iMessage API](https://www.sendblue.com/api)
- [Best iMessage API 2026 — provider comparison](https://blooio.com/blog/best-imessage-api-2026)
