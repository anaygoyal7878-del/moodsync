# Adaptive Environment Intelligence Engine

MoodSync's answer to "you have my biometrics — now do something useful
with them." This layer turns readings into a named state, a state into
a reviewable environment proposal, an accepted proposal into real
device changes, and those changes into evidence about what actually
works for this person.

```
Smartwatch + phone + context
        ↓
  personalBaselines.ts     "is this high for *you*"
        ↓
  stateEngine.ts           one state + confidence + why
        ↓
  environmentComposer.ts   a proposal, from real devices only
        ↓
  environmentGuards.ts     may MoodSync act? (usually: not yet)
        ↓
  environmentService.ts    dispatch via the existing executors
        ↓
  EnvironmentSession row   baseline biometrics captured
        ↓
  environmentLearning.ts   accepted? did it help? propose again?
```

Everything above `environmentService.ts` is pure and separately
tested — 68 tests including the product spec's ten end-to-end
scenarios in `ai/src/environmentScenarios.test.ts`.

## The constraint that shaped everything: what MoodSync can actually do

Before any of this was designed, one question had to be answered
honestly — *which of these changes can MoodSync actually make?* The
answer is much narrower than the product concept assumes:

| Surface | Reality |
|---|---|
| **Hue (Bridge)** | Full per-light brightness + colour temperature, server-side. The only rich actuation MoodSync has. |
| **Hue BLE** | Power + brightness, queued to the phone (Bluetooth needs proximity). |
| **Apple Home** | **Run a pre-existing scene. That is all.** HomeKit has no cloud API and third parties get no per-accessory write access — see docs/HOMEKIT_ARCHITECTURE.md. MoodSync cannot set a HomeKit light to 40%, cannot create a scene, cannot edit one. |
| **Spotify** | Start a playlist, server-side. |
| **Thermostat** | **Read-only. No write path exists anywhere in this codebase.** Room temperature arrives through the cached HomeKit snapshot; no provider integration implements a setpoint write. |
| **Fragrance** | **Advice only, permanently.** MoodSync cannot apply cologne. See "Scent Intelligence" below. |

This is why `ProposedChange.actuation` exists and why it is the most
load-bearing field in the whole feature:

- `automatic` — MoodSync does it, server-side, now.
- `queued_to_device` — real, but runs when the iOS companion next opens.
- `manual_only` — **MoodSync cannot do this.** Shown as advice, never
  as a pending action, and `executableChanges()` refuses to dispatch it
  at *any* automation level.

Temperature is always `manual_only`. The product spec asked for
thermostat control; building a UI that promises it would be a lie the
product could never make good on. So MoodSync gives a real,
well-reasoned temperature *recommendation* ("your bedroom is above the
sleep range you set") and says plainly that you'll need to make the
change — including in the settings screen, where the temperature
toggle's help text states it outright.

## State Engine

`ai/src/stateEngine.ts` produces one `MoodState` plus confidence and
labelled supporting signals. Three rules are enforced structurally, not
by convention:

**No state from a single value.** A candidate supported by one signal
is capped at 0.35 confidence no matter how extreme that signal is. One
elevated heart rate reading is a heart rate reading, not "stress".

**Personal baselines only.** There is no `heartRate > 100` in this
codebase. `personalBaselines.ts` compares every metric to the user's own
trailing history. A resting-60 person hitting 85 is flagged; a
resting-100 person at 102 is not.

**Never medical.** No state in the union names a condition, and
`MEDICAL_DISCLAIMER` ships *inside* the result object so no UI surface
can render an assessment without having the disclaimer available. A
test asserts no state label contains diagnostic vocabulary.

Confidence is additionally damped by how much personal history exists
(`maxSampleSize / 20`) and is capped below 1.0 — this engine estimates,
it never knows. A user's own declared state overrides inference
entirely: if someone says they're focused, MoodSync does not argue with
them from an HRV sample.

### A real bug tests caught

`compareToBaseline` originally returned `z: 0` when the historical
standard deviation was zero. That's actively wrong — against a
rock-steady baseline, *any* difference is a large deviation — and the
alternative was dividing by zero. The fix regularizes the denominator
with a floor of 2% of the baseline's own magnitude, which also stops
near-zero variance in real sensor data producing absurd z-scores off
one-BPM noise.

## Environment Composer

`ai/src/environmentComposer.ts` maps state → intent → concrete changes,
using a data table (`INTENTS`) rather than branching logic so the whole
mapping is reviewable at a glance.

Guarantees, each with a test:

- **Never proposes against a device that doesn't exist.** No lights →
  no lighting changes. No Home scenes → no scene change.
- **Never invents a scene.** Scene proposals match the user's *own*
  scene names against intent hints (`relax`, `wind down`, …). No match
  means no scene proposed.
- **Never turns lights off.** `MIN_AUTOMATED_BRIGHTNESS_PCT = 15` is a
  hard floor. Darkness is a manual decision.
- **Never jumps.** Every numeric change is clamped to the user's
  configured maximum delta (default 25 percentage points, 1.5°C).
- **Never hijacks playing music.**
- **Never merges intensity and colour.** They're separate changes with
  separate reasons, per the spec's lighting-intelligence requirement.
- **Every change carries a reason.** Enforced by test.

## Guards — the "do not over-automate" layer

`ai/src/environmentGuards.ts` is entirely composed of reasons to do
nothing. `canAutomate` refuses on: automation disabled, suggest-level,
paused, quiet hours, user away, user asleep, in a meeting, in a focus
session, recent manual override (90 min), automation cooldown (45 min),
state held under 10 minutes, or confidence under 0.6.

`canSuggest` is deliberately more permissive — a card on a dashboard
is not a device change — but still silent when the user is away,
asleep, in a meeting, or inside quiet hours. It intentionally does
*not* check the automation cooldown.

Automation levels gate execution:

| Level | May execute |
|---|---|
| `SUGGEST` (default) | Nothing. Ever. |
| `ASSIST` | Lighting, music |
| `AUTOMATE` | + Apple Home scenes (which also need their own separate toggle) |

Scene automation requires a second opt-in beyond raising the level,
because running a whole scene is the largest-blast-radius action
available.

## Learning

`ai/src/environmentLearning.ts` keeps two signals separate because they
answer different questions:

**Acceptance** — did you want this? Below a 25% acceptance rate over at
least 3 responses, MoodSync stops proposing for that state entirely.
Dismissals are excluded from the denominator: silence is not a no, and
counting it as one would suppress recommendations a user never saw.
`AUTO_APPLIED` sessions are excluded from both sides — the user never
chose them, so they aren't consent.

**Biometric response** — did it help? Only sessions with a genuinely
`measured` outcome count; `insufficient` ones are excluded rather than
averaged in as zero. Only downward heart-rate moves are surfaced, and
always as association ("has consistently been associated with"), never
causation.

## State duration and meeting detection

Two of the guards were originally fed approximations. Both are now
measured:

**`stateHeldMinutes`** — `StateObservation` rows are written on every
assessment, and `ai/src/stateHistory.ts` walks them backward to find
how long the current state has actually been continuously observed.
The subtlety is that the series is irregular (rows appear on dashboard
loads and worker ticks, not on a fixed clock), so a gap longer than
`MAX_OBSERVATION_GAP_MINUTES` (75) breaks the chain rather than
counting as continuity — two "stressed" readings twelve hours apart
are two observations, not twelve hours of stress. Unknown history
returns 0, which *blocks* automation: an absent history is never a
licence to act.

**`inMeeting`** — `isInMeetingNow` reads the live calendar for a timed
event spanning this moment. All-day events are excluded deliberately:
"Company Holiday" spans the day but is not a meeting, and treating it
as one would silence MoodSync for 24 hours.

`workers/src/environmentOutcomeWorker.ts` closes the MEASURE step —
until it existed, `EnvironmentSession.outcome*` stayed null forever and
the learning engine's biometric half never received a single data
point. Run it every 15-30 minutes; it also prunes state observations,
so retention rides along with an existing job rather than needing its
own.

## Music resolution — a category is not an address

`environmentComposer.ts` originally emitted
`params: { category: 'calm' }` for its music change. But
`spotify.play_playlist`'s executor requires `params.playlistUri` and
throws without it — **every accepted music change would have failed at
dispatch.** The composer was proposing an intent where the executor
needed an address.

`ai/src/musicResolver.ts` resolves it, in this order:

1. **What has actually worked for this user.** `musicMemory.ts` already
   ranks playlists by measured biometric effect per mode, including a
   mode-aware `helped` flag — a playlist that *raised* heart rate during
   a Relax session did not work, however large its delta. Only playlists
   still in the user's library are eligible; one that worked wonderfully
   last year but has since been deleted is not a proposal MoodSync can
   make.
2. **Keyword match** against their own playlist names, via
   `matchPlaylistByKeywords` (pure, so the matching rule is testable
   without a network mock). Earlier keywords win, and among equal
   matches the shortest name wins — "Deep Focus" beats "Focus Music For
   Studying And Long Drives".
3. **Nothing.** Returning null is a real answer: the composer then omits
   music entirely rather than proposing something unplayable.

MoodSync never searches Spotify's public catalog — it proposes the
user's own music, not a stranger's. `SpotifyClient.listPlaylists` uses
the `playlist-read-private` scope the integration already requests, so
no re-consent is needed.

## Scent Intelligence

A fourth `manual_only` channel: which Nature's Note cologne suits this
moment, and where to put it. Cologne is the clearest case of the
actuation rule — MoodSync obviously cannot spray anyone, so the channel
was designed as advice from the start rather than retrofitted into it.

**Catalog honesty** (`ai/src/scentLibrary.ts`). The four collection
entries, their descriptions, the pulse-point guidance and the
application rules are transcribed from naturesnotefragrances.com.
Solaris's full top/heart/base pyramid is published on the site and is
stored verbatim. **Everwood's and Burnt Ash's pyramids are `null`** —
the site's Scent Architecture panel is tabbed and only Solaris's tab
content was retrievable. A cologne's note pyramid is its actual
formula; guessing "probably oud and leather" for a real product a real
business sells would be fabricating a spec sheet. The null propagates:
the recommender matches on character axes it can defend instead, and a
test asserts those fields stay null.

The `character` numbers (brightness / intensity / warmth) *are*
MoodSync's own reading of each published description, used only to rank
a shortlist. They're labelled as derived and the brand does not publish
them.

**Ranking**, in weight order: occasion (strongest — a wedding and a gym
session want different answers regardless of heart rate), then time of
day, then biometric state (weakest — it nudges intensity, never
overrides an explicit occasion). Two deliberate choices:

- **Workout steers *away* from intensity, not toward it.** The obvious
  mapping is "high-energy occasion → bold scent"; heat and exertion
  amplify projection, so that's exactly the over-application mistake.
- **Timing advice is grounded in the brand's own note bands.** The site
  states top notes last ~30 minutes, so for a date the advice is to
  apply half an hour before leaving — people should meet the heart of
  the scent, not the first spray.

**Never claims an effect.** Scent-and-mood research isn't settled
enough for a product to assert a physiological result, and MoodSync
measures none. The language is fit and appropriateness — "suits",
"reads", "sits right" — never "will calm you". A test sweeps every
occasion × state combination for therapeutic phrasing.

## Known gaps

- **Not live-verified.** No Postgres, Hue bridge, or connected wearable
  was available in this environment. Everything is unit-tested and
  type-checked; the authenticated dashboard pages have not been opened
  in a browser.
- **Manual override detection is limited to what MoodSync can observe.**
  It sees a declined proposal; it cannot see a light changed directly
  in the Hue app without polling. So "respect the user's manual change"
  holds for in-app countermands only.
- **Fragrance ownership isn't modelled.** `recommendScent` accepts an
  `owned` list and honours it, but the service always passes `[]`, so
  recommendations span the whole collection rather than what the user
  actually has on their shelf. Wiring a real owned-fragrances list is
  the obvious next step and the engine already supports it.
- **Everwood and Burnt Ash note pyramids** are absent (above). If the
  brand publishes them, they drop straight into `scentLibrary.ts`.
- **`userAsleep` is always false** in the service. It would need a live
  sleep-session signal that no connected provider currently pushes —
  sleep arrives as a next-morning summary, not a "they're asleep right
  now" event. (`inMeeting` was in this list and is now real — see
  "State duration and meeting detection" above.)
- **Outcome measurement compares heart rate only.** The worker records
  a real before/after delta, but `outcomeStressDelta` is still always
  null — stress is a per-reading computed score and comparing two of
  them needs the same windowing care `musicFeedback.ts` applies, which
  isn't wired here yet.
- **No analytics charts yet.** The spec's section 21 asked for a
  charting surface; the data model supports it (every session stores
  state, confidence, response, and outcome) but the page isn't built.
