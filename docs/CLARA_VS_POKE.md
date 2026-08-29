# Clara vs. Poke — what a texting health assistant needs

Research into how [Poke](https://poke.com) (Interaction Company) is built,
measured against what Clara actually does today, with the gaps ranked by
what they'd cost to close and what they'd buy.

Written August 2026. Everything in the "Clara today" column was verified
by running it, not by reading the code.

## How Poke is built

**One front-of-house, many back-of-house.** An Interaction Agent takes
your message and replies *immediately*, while specialist Execution
Agents run in parallel in the background. The chat never blocks on a
tool call. This is the single most important structural difference from
Clara and the source of most of the felt-quality gap.

**Messaging is the whole product.** No app to install — it's a contact
in your address book. It leans on iMessage's own affordances: read
receipts, typing indicators, tapback reactions, voice messages,
interruptible replies.

**Proactive by default.** Morning briefings, flagged email, scheduled
automations, all unprompted. Your inbox doubles as external memory — it
can pull a two-year-old reservation confirmation.

**Extensible via MCP.** Users connect their own MCP servers ("Recipes"
/ "Kitchen") and Poke discovers and calls those tools.

**Personality is a feature, not decoration.** It disagrees, pushes back,
uses colloquial language. Reviewers repeatedly cite this — not raw
capability — as the reason they keep using it.

## Where Clara already matches

Verified working in this repo:

| Capability | Clara |
|---|---|
| Agentic tool-calling over real data | Yes — 8 tools, per-account selection |
| Grounded, never-invented numbers | Yes, and enforced in the prompt + tests |
| Durable memory | `remember_fact` + reinforcement counting |
| Conversation profile | Compiled from a wide inbound window, counted not replayed |
| Voice messages | Transcribed first, then run through the *same* safety pipeline |
| Proactive nudges | Burnout/threshold worker, quiet hours, daily cap, opt-out |
| Crisis safety | Deterministic, checked before everything, above verification |
| Rate limiting | 15 inbound / 10 min per handle, before any model call |

On two axes Clara is arguably **ahead**: safety-critical replies are
deterministic and unit-tested rather than model-generated, and memory is
explicit and durable where Poke reviewers report it forgetting
instructions after repeated correction.

## The gaps, ranked

### 1. The turn blocks. This is the big one.

Poke answers instantly and works in the background. Clara makes you wait
for the entire agent loop — measured at **15s in the good case**, and it
was 94–120s before the deadline work in `4674919`.

A 15-second silence in a text thread reads as broken. Nothing else on
this list matters as much.

**What to build:** send an immediate acknowledgement, then the real
answer as a second message. The transport already supports it —
`deliverAndRecord` sends outbound messages independently, and the
message log is already the conversation's source of truth. The honest
version isn't a fake "typing…" but a real first line ("checking your
last week —"), only for turns that will actually be slow (a tool call),
and never for the deterministic paths, which are already instant.

**Cost:** moderate. **Value:** the highest here by a distance.

### 2. No observability into latency, tokens, or cost

Diagnosing this session's failures required adding error logging
mid-flight and then calling Gemini by hand with curl. Standard practice
is to start with exactly this: log latency and tokens first, add quality
evals later.

`usageMetadata` (prompt tokens, output tokens, and **thinking** tokens —
the real cost driver on a 3.x model) comes back on every response and is
currently discarded.

**What to build:** log per-call model version, latency, and the token
triple. Cheap, and it turns "Clara feels slow" into a number.

**Cost:** small. **Value:** high — this is what makes every later fix
measurable.

### 3. Single model, no fallback

Poke routes across models by task. Clara pins `gemini-flash-latest`.

Worth being precise about the limit: during this session **every** model
on the key (`flash-latest`, `flash-lite-latest`, `3.5-flash`,
`3.6-flash`) returned 503 simultaneously. That was a broad Google-side
outage, and fallback would not have helped. Fallback earns its keep for
the *common* case — one model hot, others fine — not for a total outage.

**Cost:** small. **Value:** real but narrower than it first appears.

### 4. iMessage affordances are unused

Tapbacks, read receipts, typing indicators. BlueBubbles exposes some of
this. Clara currently treats iMessage as a dumb text pipe.

**Cost:** moderate, and provider-dependent. **Value:** this is a large
share of why Poke "doesn't feel like a bot".

### 5. No personality

Clara's prompt asks for "warm, concise, direct". That produces a
competent assistant with no character. Poke's reviewers stay for the
personality.

Worth noting the tension: a health assistant that pushes back is
riskier than a general one. The crisis and no-medical-advice rules must
survive any personality work — they are deterministic today precisely so
prompt changes can't erode them.

**Cost:** small (prompt). **Value:** high, but do it last and carefully.

## Failure modes to design against

From Poke's own reported problems, and from what actually broke here:

- **Slow third-party tools.** Poke users report MCP integrations
  dragging. Clara's tools hit Postgres and Hue; each is a latency risk
  inside an already-slow turn. Every tool needs its own timeout.
- **Memory that doesn't stick.** Poke's most-cited complaint. Clara's
  explicit `remember_fact` is the better design — keep it explicit.
- **Retrying making things worse.** Measured here: retry without a
  deadline turned a 30s failure into a 120s one, and retrying an
  exhausted daily quota spends more of an allowance already gone.
- **Silent error swallowing.** Cost the most time this session. A
  generic "couldn't work that out" with nothing logged made an outage
  and a real bug indistinguishable.
- **Provider drift.** `gemini-flash-latest` silently became a *thinking*
  model, which broke every tool call until thought signatures were
  echoed back. Aliases move under you; pin deliberately or handle drift.

## Suggested order

1. Token/latency logging — makes everything else measurable
2. Immediate acknowledgement — the felt-quality fix
3. Per-tool timeouts — stops one slow tool eating the turn
4. Model fallback — for the single-hot-model case
5. Tapbacks / receipts — provider-dependent polish
6. Personality — last, and without touching the deterministic safety paths

## Sources

- [Poke makes using AI agents as easy as sending a text — TechCrunch](https://techcrunch.com/2026/04/08/poke-makes-ai-agents-as-easy-as-sending-a-text/)
- [Poke — the AI agent living inside iMessage](https://mana.am/en/blog/poke-sms-ai-agent/)
- [A Week with Poke: review — Product Hunt](https://www.producthunt.com/p/poke-by-interaction-co/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant)
- [LLM Monitoring Best Practices 2026](https://openobserve.ai/blog/llm-monitoring-best-practices/)
- [LLM Latency Benchmarks 2026](https://www.kunalganglani.com/blog/llm-latency-benchmark-optimization)
