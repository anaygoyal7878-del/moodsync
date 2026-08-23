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

## Routing: what stays deterministic, and why

`classifyInbound` used to also short-circuit "status" and "log_caffeine"
straight to a canned reply — real numbers, but chosen by regex, so a
phrasing it didn't recognize ("what's my HRV looking like") fell through
to a generic "I don't recognize that" instead of just answering.

Those two now route through the model like any other question, via
`get_wearable_snapshot` (which now includes a real `readiness` figure —
the same one the retired deterministic status reply used) and the new
`log_caffeine_intake` tool. What's still handled without a model call is
narrower and deliberately mechanical:

| Stays deterministic | Why |
|---|---|
| Crisis language | Must never be improvised by a model, ever |
| Verification code | A 6-digit reply has exactly one meaning |
| STOP / START | Carrier-mandated opt-out words — no judgment involved |
| HELP | Static capability list, not a data lookup |
| Rate limiting | Must reject before spending a model call, not after |
| Pending-action yes/no | "Yes" means "do what I proposed last turn," decided before normal routing even runs |

Everything else — status, caffeine logging, device control, nutrition
questions, anything conversational — goes through
`sendAgenticMessage`. The dividing line isn't "safety-critical vs. not,"
it's "has exactly one correct mechanical answer vs. requires picking the
right real data and phrasing a reply."

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
     ├─ crisis / verify code / STOP / START / HELP / rate limit → deterministic, no model call
     ├─ pending action from last turn? ─ yes/no reply? → confirm/cancel (no model call)
     │
     └─ everything else → ai/src/agenticMessaging.ts (sendAgenticMessage)
                              │
                   ┌──────────┴──────────┐   compile this chat's agent
                   ▼          ▼          ▼
              capability   observed   declared
              (live        (counted   (MessagingMemoryFact,
               connections) profile)   ranked by reinforcement)
                   │          │          │
                   └──────────┬──────────┘
                              ▼
                  tool surface + system prompt
                              │
                    Gemini function-calling loop (MAX_TOOL_ROUNDS = 4)
                              │
              ┌───────────────┼───────────────┐
              ▼                ▼               ▼
      read tool          write tool        action tool
   (ai/src/messagingTools.ts)
   executes             executes           NEVER executes itself —
   immediately,          immediately,       only validates the target
   result fed             no confirm        exists and returns a
   back to model          needed            confirm sentence
```

### `ai/src/messagingTools.ts` — the tool registry

Each tool declares a Gemini `FunctionDeclaration` and pairs it with a
handler. Tools are `kind: 'read'`, `kind: 'action'`, or `kind: 'write'`:

- **Read tools** (`get_wearable_snapshot`, `list_smart_home_devices`,
  `get_nutrition_guidance`) run immediately and hand data back to the
  model — no side effects, no confirmation needed.
- **Action tools** (`control_hue_light`, `activate_hue_scene`,
  `create_calendar_event`) are structurally incapable of touching real
  state in the same turn they're called. The handler resolves/validates
  (so a nonexistent light, or an event further out than the calendar
  write's own 90-day/24-hour bounds, never gets a confirmation prompt)
  and returns a `confirmPrompt` string — nothing else. What
  `executeConfirmedAction` does after a second, separate inbound message
  confirms it differs by tool: Hue calls the API directly;
  `create_calendar_event` queues a `PendingCalendarWrite` instead, since
  EventKit — like HomeKit — has no server-side write path at all (see
  docs/APPLE_CALENDAR_ARCHITECTURE.md). "Confirmed" means "queued for
  the device," not "done," and the confirmation prompt says so.
- **Write tools** (`log_caffeine_intake`, `remember_fact`) sit between
  the two: they do cause a real write, immediately, with no
  confirmation — but the blast radius is a database row the user can
  ignore or that self-corrects (a bad log doesn't compound; a
  forgettable fact just... isn't remembered next time), not a physical
  device changing state in someone's home. Requiring "YES" to log a
  coffee would be friction with no matching safety benefit.

The action-tool split is the safety property, not a convention layered
on top of it: there is no code path from "model decided to call
`control_hue_light`" to "a light actually changed" without a second,
independent inbound message in between. `MESSAGING_ACTION_TOOL_NAMES`
(only `kind: 'action'` tools) is what the tool-calling loop checks
before treating a result as something to confirm rather than something
to just execute — a write tool is never in that set, so it always takes
the same "execute and feed the result back" path a read tool does.

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

## The compiled agent — why two chats aren't the same program

The prompt and the tool surface are **assembled per conversation**, not
templated. Three inputs feed the assembly, and they are deliberately
never mixed together:

| Input | Source | What it decides |
|---|---|---|
| **Declared** | `remember_fact` — the model chose to save these | What it knows it was told |
| **Observed** | `ai/src/messagingProfile.ts`, counted from the real message log | Register, timing, recurring topics |
| **Capability** | live connection state | Which tools exist at all this turn |

### Capability → tool surface

`selectMessagingTools` builds the function-declaration list from what
the account actually has connected. Someone with no Hue bridge is never
handed `control_hue_light` — the tool is not declared, so "turn off the
bedroom light" produces an honest "you haven't connected a bridge" and
not a confident confirmation prompt for a light that doesn't exist.

This is deliberately structural rather than a prompt instruction,
because it buys two things at once: **credibility** (a capability the
model cannot see is one it cannot promise — telling a model not to use
a tool is advisory, not declaring it is not) and **efficiency** (three
unused declarations otherwise ride along in every request of every
turn). The gate is enforced twice: at declaration, and again at
execution, where the loop resolves tool names against the *selected*
surface so a hallucinated or carried-over tool name can't reach a
handler.

`get_wearable_snapshot` is pointedly *not* gated on owning a wearable —
with no data it returns `hasData: false`, which is a real answer.
Removing it would leave the model with no grounded way to discover
there's no data, which is exactly the situation where models guess.

### Observed traits, and the rule that keeps them honest

`compileConversationProfile` counts three things from the inbound log:
typical message length (→ how long the reply should be), time-of-day
band, and recurring intents. Two floors gate every one of them:

- **A sample floor.** Under 8 inbound messages nothing is derived at
  all, and the profile reports `stillLearning` — which is distinct from
  "plenty of messages, no pattern found", because those are different
  things to tell a model.
- **A dominance floor.** A time band must hold ≥40% of messages before
  it counts. Across five bands, chance alone puts ~20% in each, so a
  22% plurality is what noise looks like. Reporting it as "you text
  mostly in the evening" would fabricate a habit and then let the model
  repeat it back as though MoodSync knew something.

Median (not mean) message length means one pasted paragraph doesn't
reclassify someone who otherwise texts in fragments. Channel-mechanics
intents (`help`, `question`, `stop`) are excluded from "interests" —
"they ask for help a lot" is not an insight about a person.

Observed traits render under a heading that states they were *counted*,
with the count inline (`8 of 10 messages`), and explicitly instructs the
model not to state them back as things the person said. That labelling
is load-bearing, not decoration: "you told me you train in the
mornings" and "you tend to text me at night" are different epistemic
claims, and a model handed one undifferentiated list will assert the
second with the confidence of the first.

### Efficiency

The wide profile window (120 messages) is only ever *aggregated* —
counted, never sent to the model as text — which is why it can afford
to be much wider than the 10-turn replay window that does cost tokens
per message. The rendered block is capped at
`PROFILE_BLOCK_BUDGET_CHARS`, drops whole facts rather than truncating
one mid-sentence, and returns the empty string when there's nothing
credible to say, so a brand-new conversation costs nothing extra rather
than carrying a paragraph explaining that MoodSync knows nothing yet.

## Voice messages

Poke accepts a voice memo as input; this closes the same gap.
Deliberately **not** "send audio straight to the model" — that would
have skipped `classifyInbound`'s crisis check, which runs on text and
"must never be improvised by a model, ever" (see the routing table
above). So a voice message becomes text *first*, through
`ai/src/voiceTranscription.ts`, and only the resulting transcript ever
touches the rest of the pipeline — crisis detection, verification,
classification, the agentic loop, all of it, unmodified and unaware a
message ever wasn't typed.

```
inbound webhook, attachments: [{ guid, mimeType: "audio/..." }]
      │
      ▼
messagingService.handleInbound
      │  connection known?  ──no──▶  UNVERIFIED_REPLY, never transcribed
      │  yes
      ▼
downloadBlueBubblesAttachment(guid)     [GET /api/v1/attachment/:guid/download]
      │
      ▼
transcribeVoiceMessage(bytes, mimeType)  [format allowlist checked first,
      │                                   then Gemini audio understanding]
      ▼
body = transcript  ──▶  classifyInbound(body)  ──▶  everything else, unchanged
```

**Never transcribed for an unrecognized sender.** Crisis detection over
text is a free regex check MoodSync can afford to run even for
strangers (see the doc's "Crisis sits above verification" note above);
transcription is a paid model call, and doing it on demand for anyone
who can reach the webhook would be an open, uncapped cost/abuse
surface. So an unknown number sending a voice message gets the same
`UNVERIFIED_REPLY` a text would, with no transcription attempted —
which means, stated plainly, **crisis language spoken (not typed) by an
unrecognized number is not caught the way typed crisis language is.**
A real, narrower coverage than the text path, disclosed rather than
silent.

**A format allowlist gates the transcription call.** Gemini's
documented supported audio types for inline input
(`SUPPORTED_AUDIO_MIME_TYPES` in `voiceTranscription.ts`) notably do
**not** include CAF (Core Audio Format) — which is Apple's own native
voice-memo format. Whether a BlueBubbles-cached inbound iMessage voice
memo actually arrives as CAF, or something Gemini accepts, has never
been confirmed against a live BlueBubbles server in this environment.
An unsupported format fails with a specific, honest reply ("I couldn't
understand that voice message... try a different format") rather than
being silently mangled or guessed at.

A transcription failure is logged with a literal placeholder —
`[voice message — could not transcribe]` — never a fabricated
transcript, so the audit trail never claims to know what wasn't
understood.

## Persistent memory across conversations

Before this round, `sendAgenticMessage` only ever saw the last
`HISTORY_TURNS` (10) messages, replayed fresh each call — the model had
no way to recall anything from a conversation that had scrolled out of
that window, let alone from a previous day. `MessagingMemoryFact`
(`database/prisma/schema.prisma`, `messagingMemoryRepository.ts`) is a
small, explicit long-term memory on top of that short-term replay:

- **The model decides what's worth remembering**, via the `remember_fact`
  write tool — a preference or recurring pattern, one short sentence,
  never a one-off (today's mood, today's schedule) or a medical claim.
  The system prompt tells it explicitly that most turns should call
  this zero times; it's meant to be rare, not a running transcript.
- **Facts are scoped to `userId`, not the messaging connection** — this
  agent is deliberately channel-agnostic (see this file's header, and
  `ai/src/messagingAgent.ts`'s), so a fact learned by text is available
  if the same account later reaches the in-app chat, and vice versa.
- **Every call to `sendAgenticMessage` fetches the most recent facts
  and injects them into the system prompt** as a "what you remember
  about this person" block, before the model sees the current message.
  This is a best-effort lookup (`.catch(() => [])`) — a memory-store
  outage degrades to "no memory this turn," not a broken reply.
- **Re-saving reinforces instead of duplicating.** `normalizeFact`
  (casing and punctuation only — deliberately *not* fuzzy or semantic,
  since wrongly merging two distinct memories destroys one silently)
  keys an upsert, so a conclusion the model keeps independently
  reaching bumps a counter rather than filling the prompt with near
  identical lines. The original wording is kept over the rephrase: a
  stored memory that rewrites itself on every repeat is less stable,
  not more.
- **`MAX_FACTS_PER_USER = 30`, least-reinforced dropped first** (oldest
  as the tiebreak). Unbounded growth would slowly bloat every future
  prompt with years of trivia; capping by reinforcement means something
  concluded four separate times outranks something noted once and never
  returned to.

This is deliberately simple — no embeddings, no relevance ranking, no
summarization. Thirty short facts read in full is cheap and legible; a
retrieval pipeline would be solving a problem this account size doesn't
have yet.

## The settings surface — and what Poke does

Poke (Interaction Co.) is the closest shipping comparison: an AI
assistant that lives in iMessage, is "proactive, private, personal",
remembers your preferences, and acts through connected integrations.
Four of its patterns were worth taking, and the reasons they map onto
MoodSync differ in each case:

| Poke pattern | What MoodSync does with it |
|---|---|
| Proactive messaging — morning briefings, flagged email, scheduled automations | Kept, but **gated**. MoodSync already texted unprompted; what was missing was any way to say when. |
| Memory that learns preferences | Already built (`MessagingMemoryFact`); this round added the screen that makes it inspectable and erasable. |
| Integrations define what it can do | Mapped onto the capability-derived tool surface, and surfaced read-only so the screen can't over-promise. |
| An explicit privacy control ("Maximum Privacy" excludes data from training) | Not adopted **for this path** — the LLM is used for inference only, never training. See the correction below. |

> **Correction (superseding the row above).** MoodSync now *does* fit a
> model to user data — see docs/AFFECT_MODEL_ARCHITECTURE.md. It is a
> per-user statistical model over that person's own check-ins and
> readings, never pooled across users and never sent to a model
> provider, and it is unrelated to the Gemini path described in this
> document. The original claim was true of the LLM and is still true of
> it; it was too broad as written.

The screen lives at `/dashboard/connections/messaging`, ordered by what
a person actually needs to decide: is it connected → what can it do →
when may it interrupt me → what does it know about me. Interruption
controls sit above memory because "stop texting me at 2am" is more
urgent than "forget that I prefer mornings".

### Everything here governs unprompted messages only

`MessagingSettings` (per user, not per handle — someone with two
numbers wants one answer to "when may you text me") holds three
controls, and all three gate `sendProactiveInsight` through one pure
function, `canSendProactive`:

- **`proactiveEnabled`** — may it text first at all. Deliberately
  distinct from a STOP opt-out, which silences replies too; wanting a
  bot that answers when asked and never interrupts otherwise is a
  coherent position the old model couldn't express.
- **Quiet hours** — a local-hour window, half-open, wrap-around
  handled because 22→7 is the normal case not the edge case. A
  zero-width window (start === end) reads as *no* quiet hours, never
  "always quiet" — the latter would silently mute everything from a
  setting that looks like a no-op.
- **`dailyProactiveLimit`** — a hard ceiling counted from local
  midnight. This is enforceable rather than notional only because
  proactive sends are now tagged `intent: 'proactive'` on the outbound
  row; without that tag there'd be nothing to count.

`canSendProactive` is pure and entirely composed of reasons to stay
quiet, in the same spirit as `environmentGuards.ts`. The asymmetry with
`handleInbound` is the design: replying to someone who texted first
needs almost no permission, interrupting someone who didn't needs all
of it.

The default is `proactiveEnabled: true`, which breaks this codebase's
usual conservative-default habit *on purpose*. Proactive texting already
shipped and already fires; defaulting the new row to `false` would have
silently switched off a live feature at migration time. The conservative
choice is the one that doesn't change behaviour behind the user's back
— the control is the new thing, not a new default.

### Memory you can actually see

`GET/DELETE /messaging/memory` and the panel over it exist because a
memory the subject can't inspect isn't a feature, it's a dossier. It
also closes a gap this doc previously disclosed: with reinforcement
ranking eviction, a *confidently wrong* fact became harder to remove by
attrition than a rarely-repeated true one. The reinforcement count is
shown rather than hidden, because "concluded this 4 separate times"
explains why a fact keeps shaping replies in a way a bare list can't.

### A capability list that can't lie

`GET /messaging/capabilities` returns the output of the same
`selectMessagingTools` the agent uses to build its tool surface, so the
screen structurally cannot advertise an ability the agent won't have
when you text it — the failure mode every hardcoded feature list
eventually has. Unavailable abilities render greyed with the reason
("needs a connected Hue bridge") rather than hidden, since silently
omitting them looks like the feature doesn't exist.

## Verification

Unit-tested: tool handlers (target-not-found errors, confirm-prompt
text, nutrition data shape), the confirm/cancel/fall-through paths in
`messagingService`, the profile compiler's suppression floors, the
tool-surface selection rules, and every branch of `canSendProactive`
including the wrap-around and zero-width quiet-hours cases.

The settings screen itself is build- and lint-verified and its routes
are registered, but it has **not been rendered logged-in**: no Postgres
was running in this environment, so the page could only be observed
307-redirecting to `/login`, which at least confirms it compiles, serves,
and is behind the auth guard. Not live-tested: an actual Gemini function-calling
round trip and an actual Hue API call from a text message — no live
Gemini key or Hue bridge was available in this environment, matching
every other "not round-tripped against a real X" disclosure in
docs/MESSAGING_BOT.md.

## Model choice: cost and adaptivity

Both call sites (`atlasChat.ts`, `agenticMessaging.ts`) run
`gemini-flash-latest` — Google's maintained "latest flash" alias rather
than a dated model name, chosen because a dated name (`gemini-2.5-flash`)
was confirmed to 404 with "no longer available to new users" while still
listed in `models.list`; the alias is what Google itself repoints as
models deprecate, so it's the pin that doesn't rot.

Evaluated against pricing as of August 2026 (per 1M tokens, in/out):

| Model | Price | Verdict |
|---|---|---|
| `gemini-flash-lite-latest` | ~$0.25 / $1.50 | Cheapest, but function-calling reliability is weaker — risky for the confirm-then-execute Hue path, where a misfire is a real device change, not a bad sentence. |
| `gemini-flash-latest` (current) | ~$0.75 / $3.75 | Right-sized for tool-calling turns; capable enough for the confirm/action split to hold. |
| `gemini-*-pro-latest` | ~$2 / $12 | Overkill — this is a text assistant answering from structured tool output, not doing novel reasoning. Paying Pro-tier price buys capability the task doesn't use. |

**Recommendation, not yet built:** a two-tier split — route the high
volume of simple turns (status questions, caffeine logging, anything
that resolves to zero or one tool call) to Flash-Lite, and reserve
Flash for turns that need multi-step tool orchestration or touch the
compiled per-conversation profile (`messagingProfile.ts`). That's where
"adaptive" actually lives for this system: not a model property, but a
routing decision made per turn, ahead of `sendAgenticMessage`. Left as a
recommendation rather than implemented — it's a real architecture
change (a classifier or heuristic deciding model choice before the
tool-calling loop even starts), not a config swap, and hasn't been
asked for as a build yet.

**Not adopted:** switching provider families (OpenAI, Anthropic).
`toGeminiTools()`'s function-calling shape and the "latest" alias
repoint behavior are both Gemini-specific; a switch would mean
rebuilding the tool-declaration layer for a different provider's
schema, for no capability or cost gain this workload needs.

## Known gaps

- **HomeKit and Spotify control-by-text are not built.** Only Hue.
  Extending the registry is adding tools, not restructuring anything.
- **The model can call a read tool and an action tool in one round** in
  principle (Gemini can return multiple `functionCalls`); only the first
  is honored. The system prompt steers against this, but it's a prompt
  instruction, not an enforced constraint.
- **No live Gemini function-calling round trip has been run.**
  `@google/genai`'s function-calling shapes were confirmed from its
  shipped `.d.ts` types, not from an authenticated call. This now also
  covers `log_caffeine_intake` and `remember_fact` — their write paths
  are unit-tested directly, but never through an actual model turn that
  chose to call them.
- ~~Memory has no forget/edit surface~~ — built:
  `/dashboard/connections/messaging`'s memory panel lists every
  remembered fact with a delete button. There's still no *edit*, only
  forget-and-let-it-be-relearned, but "forget" alone closes the real
  risk (a confidently-wrong fact being un-evictable).
- **The settings screen has never been rendered with real data.** See
  Verification — auth guard confirmed, everything past it unobserved.
- **Voice messages haven't been round-tripped against a real
  BlueBubbles server either.** Whether inbound iMessage voice memos
  arrive as CAF (unsupported — see "Voice messages" above) or something
  Gemini accepts is unconfirmed; `downloadBlueBubblesAttachment`'s
  response shape is best-effort against BlueBubbles' published docs,
  same caveat `sendBlueBubblesMessage` already carried.
- **An unrecognized number's spoken crisis language isn't caught.**
  Deliberate, disclosed in "Voice messages" above — transcription is a
  paid call and is only ever attempted for a known connection.
- **Quiet hours and the daily cap are enforced only for
  `sendProactiveInsight`.** They are not consulted by anything else
  that might one day message a user unprompted; a second proactive
  sender would have to opt in to the same gate deliberately.
- **Observed traits have no decay.** `compileConversationProfile`
  weights a message from four months ago exactly like yesterday's, so a
  person whose habits genuinely changed carries the old pattern until
  the new one out-counts it across the whole 120-message window.
- **Capability gating covers Hue only**, because Hue is the only
  control integration wired to this channel. When HomeKit or Spotify
  land, each needs its own entry in `HUE_DEPENDENT_TOOLS`' successor —
  the mechanism generalizes, the current table does not.
- **The SQL backfill and `normalizeFact` must stay in lockstep** and
  nothing enforces it. They're byte-matched by hand and covered by
  unit tests on the TS side only; the SQL half has never run, since no
  Postgres was available in this environment.
- **"How am I doing" lost the calendar-aware `focusToday` line.** The
  retired deterministic status reply used
  `loadCompanionContext`+`composeDailyBrief`, which factored in today's
  booked calendar hours; `get_wearable_snapshot` (in the `ai` package,
  which can't reach the backend's calendar-aware context loader — see
  this project's established cross-package-duplication convention)
  only has the biometric-derived readiness figure. A status reply from
  text is now real numbers without that one extra nuance the in-app
  daily brief still has.
