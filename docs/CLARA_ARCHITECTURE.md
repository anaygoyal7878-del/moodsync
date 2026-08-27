# Clara

Clara is MoodSync's assistant: the conversational layer over the same
intelligence engine the rest of the app runs on. She reads this
account's real biometric, wellness, automation and connection data, and
can take real actions through tools (control a light, log a caffeinated
drink, propose a calendar event, remember a durable fact).

**Clara's product surface is messaging.** You text her; she texts back.
There is no chat panel in the web app.

## Why messaging, not a web chat panel

The web app had an in-app chat page (formerly "Atlas"). It was removed,
and the assistant renamed to Clara, for one reason: a wellness assistant
you have to *go to a tab and open* competes with every other tab, while
one that lives in your existing message thread reaches you where you
already are. The engine behind it was never the problem — it is
unchanged and now has exactly one product surface instead of two
partially-overlapping ones.

What that means concretely: the phone channel is no longer a scaled-down
mirror of a "real" web chat. It is the real thing, and it is the one
that gets the durable conversation state (see below).

## The pieces

| File | Role |
|---|---|
| `ai/src/claraChat.ts` | Builds Clara's grounded system prompt from this account's real data, and defines `ClaraChatMessage` / `ClaraNotConfiguredError`. |
| `ai/src/agenticMessaging.ts` | The agent loop: tool selection, the tool-call rounds, and the pending-action contract. |
| `ai/src/messagingTools.ts` | The tool surface — what Clara can actually read and do, selected per account. |
| `ai/src/messagingAgent.ts` | The deterministic layer: crisis, STOP/START, HELP, verification. Never model-generated. |
| `backend/src/services/messagingService.ts` | The inbound pipeline and transport. Owns ordering (see below). |
| `backend/src/api/routes/clara.ts` | Clara's stateless HTTP surface. |

## Two surfaces, one engine

**Messaging (the product surface).** Durable: a `MessagingConnection`
identifies the sender, conversation history is replayed from the message
log, and a proposed action is persisted as a `MessagingPendingAction`
row so "yes" on the next message means what it should.

**HTTP (`/api/clara/chat`, `/api/clara/actions/confirm`).** Stateless:
the caller replays history and holds a proposed action itself, echoing
the exact tool name and args back to `/clara/actions/confirm`.
`executeConfirmedAction` re-validates them from scratch either way — a
light could have been renamed or disconnected in between — so both
surfaces get the same safety property.

**Nothing in this repo calls the HTTP surface today.** It is kept
deliberately: it is the engine's API boundary, it carries the engine's
only direct route-level tests (`clara.test.ts`), and it is what a
non-SMS surface (the iOS companion, say) should talk to rather than
reaching into the `ai` package directly. It is a maintained boundary,
not an accident — if that stops being true, delete it rather than
letting it rot.

## What is deliberately not model-generated

`messagingAgent.ts` answers these itself, as pure tested functions:

- **Crisis language** — checked before everything else, so it can never
  be shadowed by a message that also contains a command word. It also
  sits *above* verification: someone in distress texting an unrecognized
  number still gets a crisis line.
- **STOP / START** — carrier-mandatory opt-out keywords.
- **HELP** — the capability list. This is where Clara introduces herself
  by name.
- **Verification** — the 6-digit code flow.

Everything else falls through to Clara.

See `docs/MESSAGING_BOT.md` for the full inbound ordering and
`docs/MESSAGING_AGENTIC_ARCHITECTURE.md` for the tool contract.
