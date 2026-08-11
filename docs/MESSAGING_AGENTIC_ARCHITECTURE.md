# The iMessage bot as an agent, not just a chatbot

`docs/MESSAGING_BOT.md` covers the transport (why BlueBubbles, why Apple
has no public API, verification, safety, opt-out). This doc covers what
changed to make the bot actually *do* things — check a smartwatch,
control a Hue light, give nutrition guidance — instead of only
describing them in text.

## What "normal person chatting, but completes tasks" means here

Three real ability domains, each honestly scoped to what already exists
in MoodSync or what's a proportionate new build:

| Ability | Backing | Scope this round |
|---|---|---|
| Wearable / smartwatch info | `biometricReadingRepository` + `computeWellnessScores` — the exact data the dashboard and Atlas's in-app chat already use | Full — same data, no new domain |
| Smart home control | `ai/src/hueActionExecutor.ts` — already existed for automation rules | **Hue only.** HomeKit has no synchronous cloud execution (it's queue-based — see docs/HOMEKIT_ARCHITECTURE.md) and Spotify control-by-text wasn't in scope this round. Extending to those is adding entries to the tool registry, not a redesign. |
| Nutrition guidance | Nothing — MoodSync has no food-logging or calorie-tracking feature | **General, not personalized.** Grounded in real caffeine/energy data where relevant, otherwise standard nutrition knowledge. Explicitly not a diet plan — see "Nutrition guidance, honestly" below. |

Everything else (crisis detection, verification, opt-out, rate limiting,
outbound delivery) is unchanged — see docs/MESSAGING_BOT.md.

## Why tool-calling, not a bigger regex

The existing `classifyInbound` intent classifier (HELP/STOP/START,
verification codes, caffeine logging) works because those are a closed,
small set of exact phrasings. "Turn off the lights in a way that sounds
natural" is not that — there's no finite set of ways to phrase "make it
dark in here." Gemini's native function-calling
(`GoogleGenAI.models.generateContent({ config: { tools } })`, confirmed
against `@google/genai`'s real types, not assumed) does the phrasing
work; MoodSync's job is deciding what tools exist and what they're
allowed to touch.

## Architecture

```
inbound text
     │
     ▼
messagingService.handleInbound
     │
     ├─ pending action from last turn? ─ yes/no reply? → confirm/cancel (no model call)
     │
     └─ open question → ai/src/agenticMessaging.ts (sendAgenticMessage)
                              │
                    Gemini function-calling loop (MAX_TOOL_ROUNDS = 4)
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
         read tool (ai/src/messagingTools.ts)   action tool
         executes immediately,                   NEVER executes itself —
         result fed back to the model             only validates the target
                                                    exists and returns a
                                                    confirm sentence
```

### `ai/src/messagingTools.ts` — the tool registry

Each tool declares a Gemini `FunctionDeclaration` and pairs it with a
handler. Tools are `kind: 'read'` or `kind: 'action'`:

- **Read tools** (`get_wearable_snapshot`, `list_smart_home_devices`,
  `get_nutrition_guidance`) run immediately and hand data back to the
  model — no side effects, no confirmation needed.
- **Action tools** (`control_hue_light`, `activate_hue_scene`) are
  structurally incapable of touching real state in the same turn they're
  called. The handler resolves the target by name (so a nonexistent
  light never gets a confirmation prompt) and returns a `confirmPrompt`
  string — nothing else. The actual Hue API call
  (`executeConfirmedAction` in the same file) only runs after a second,
  separate inbound message confirms it.

This split is the safety property, not a convention layered on top of
it: there is no code path from "model decided to call
`control_hue_light`" to "a light actually changed" without a second,
independent inbound message in between.

### Confirmation survives statelessness — `MessagingPendingAction`

A dashboard button can hold "are you sure?" in component state. A text
thread can't — the webhook that handles "yes" has no memory of the
webhook that asked the question three seconds earlier. `schema.prisma`'s
`MessagingPendingAction` (one row per connection, 5-minute TTL) is that
memory: `messagingService.handleInbound` checks for one *before* running
`classifyInbound`'s normal routing, because "yes" needs to mean "do the
thing I proposed" when a pending action exists, not the carrier-standard
START opt-in word `classifyInbound` would otherwise read it as.

If the reply is neither a yes-shaped nor no-shaped phrase, the pending
action is left alone (not force-cleared) and the message falls through
to normal handling — so "turn off the bedroom light" → "wait, what's my
heart rate right now?" doesn't silently execute a stale confirmation
three messages later; it just expires on its own TTL.

### The tool-calling loop — `ai/src/agenticMessaging.ts`

`sendAgenticMessage(userId, messages)`:

1. Builds the same grounded system prompt Atlas's in-app chat uses
   (`buildAtlasSystemPrompt`, exported from `atlasChat.ts` for reuse)
   plus a messaging-specific suffix describing the tools and the
   "action tools don't execute yet" rule.
2. Calls Gemini with `tools: [{ functionDeclarations: [...] }]`.
3. If the model returns a function call: runs the read tool immediately
   and loops (feeding the result back via
   `createPartFromFunctionResponse`), or — for an action tool — returns
   immediately with `pendingAction` set and the tool's own
   `confirmPrompt` as the reply text. The model's own phrasing is
   discarded in this case on purpose: the confirmation wording is the
   tool's, not the model's, so it can never be softened or dropped by a
   rephrase.
4. If the model returns plain text with no function call: that's the
   final reply.
5. `MAX_TOOL_ROUNDS = 4` bounds the loop — a guard against the model
   getting stuck re-calling a tool, not an expected depth.

### Nutrition guidance, honestly

There is no food or calorie domain anywhere in MoodSync — no schema, no
logging UI, nothing to extend. Building one to answer "should I eat
before my workout" would be a much bigger feature than this pass, and a
fabricated food database would be worse than no feature at all.

`get_nutrition_guidance` instead does two real things: it pulls this
account's actual recent caffeine logs and current energy/recovery scores
(the same data `get_wearable_snapshot` and the dashboard's energy meter
already use), and it instructs the model to answer using general,
well-established nutrition knowledge — grounding the answer in the real
data *only* where it's actually relevant (caffeine timing, hydration,
pre/post-workout eating tied to current recovery), never inventing a
calorie count or macro target, and stating plainly that this is general
guidance, not a personalized plan. This mirrors how Atlas's in-app chat
already handles workout suggestions — general knowledge, explicitly
labeled as general, grounded in real data where real data exists.

## Verification

Unit-tested: tool handlers (target-not-found errors, confirm-prompt
text, nutrition data shape) and the confirm/cancel/fall-through paths in
`messagingService`. Not live-tested: an actual Gemini function-calling
round trip and an actual Hue API call from a text message — no live
Gemini key or Hue bridge was available in this environment, matching
every other "not round-tripped against a real X" disclosure in
docs/MESSAGING_BOT.md.

## Known gaps

- **HomeKit and Spotify control-by-text are not built.** Only Hue.
  Extending the registry is adding tools, not restructuring anything.
- **The model can call a read tool and an action tool in one round** in
  principle (Gemini can return multiple `functionCalls`); only the first
  is honored. The system prompt steers against this, but it's a prompt
  instruction, not an enforced constraint.
- **No live Gemini function-calling round trip has been run.**
  `@google/genai`'s function-calling shapes were confirmed from its
  shipped `.d.ts` types, not from an authenticated call.
