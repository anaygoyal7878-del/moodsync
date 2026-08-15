# Proactive health-insight texting — "Poke, but health-focused"

The ask: not a device-control bot, an unprompted-texting one — the bot
notices something real in your data and reaches out first, the way
[Poke](https://poke.com) reaches out about your inbox. This doc covers
the proactive half specifically. Everything reactive (crisis detection,
verification, HELP/STOP/START, caffeine logging, on-demand Q&A) is
unchanged — see docs/MESSAGING_BOT.md. Everything agentic/task-executing
(Hue control, nutrition guidance) is unchanged — see
docs/MESSAGING_AGENTIC_ARCHITECTURE.md and stays available on-demand,
just not the focus of this round.

## The key move: reuse the insight engine, add one delivery channel

MoodSync already has a real, working "notice something and tell the
user" engine — it just only spoke to the in-app notification feed.
Nothing about *detecting* an insight changed here; only *where it's
allowed to say it* did.

`workers/src/proactiveNotificationsWorker.ts` runs on a periodic tick
(suggested 30-60 min) and evaluates six real checkers from
`ai/src/proactiveNotifications.ts` per user with recent data:

- `checkRecoveryUnusuallyHigh` — recovery score is a real outlier above
  this account's own recent baseline (not a fixed threshold).
- `checkBurnoutRisk` — poor sleep + low recovery + (elevated resting
  heart rate z-score OR an overloaded calendar — calendar signal not
  wired into this worker yet, see its own comment).
- `checkRoomTemperatureOutsideSleepRange` — bedroom temp vs. this
  user's own configured sleep-temp preference.
- `checkSceneTimeOfDayPattern` — "you usually run this scene around
  this time."
- `checkSocialBatteryLow` — this account's computed Social Battery
  (`computeSocialBattery`: sleep + recovery + HRV-vs-own-baseline +
  calendar load, calendar always null here for the same reason
  `checkBurnoutRisk` can't see it) reads as `'low'`. Doesn't fire for
  `'medium'`/`'high'` — only the actionable end of the scale.
- `checkHabitStreakMilestone` — a walking/meditation/focus streak
  (`computeWalkingStreak`/`computeMeditationStreak`/`computeFocusStreak`,
  all pre-existing) lands *exactly* on a milestone value (3, 7, 14, 21,
  30, 60, 90, 100, 180, 365 days). The equality check is what keeps this
  from repeating every day of a long streak without its own dedupe
  window — the title itself changes daily, so the shared 20h dedupe
  never needs to suppress a repeat.

Additionally, `workers/src/weeklyReportWorker.ts` — previously silent,
only ever persisting `Insight` rows for the in-app weekly report page —
now also delivers (in-app + text) a combined "Your Weekly Check-In"
headline once a week, built from the same `biggestImprovement`/
`bestHabit` computation it already had. This worker's own cadence
*is* the weekly gate; a small dedupe window (6 days) guards only against
an accidental duplicate run, not against real week-to-week repeats.

Each fires at most once per `DEDUPE_WINDOW_HOURS` (20h) per title, so a
persistent condition doesn't spam. Previously, a firing candidate only
ever became a `Notification` row (`deliverNotification`, which itself
respects the existing digest-mode preference). Now, right after that
in-app delivery, the same candidate also goes through
`sendProactiveInsight` (`ai/src/messagingDelivery.ts`) — text delivery
piggybacks on the exact same dedupe/frequency logic, so nothing had to
be reinvented to keep this from being annoying.

```
proactiveNotificationsWorker tick
     │
     ▼
checkRecoveryUnusuallyHigh / checkBurnoutRisk / checkRoomTemperature... / checkSceneTimeOfDayPattern
     │  (candidate, deduped by title within 20h)
     ▼
deliverNotification(userId, title, body)   ← existing in-app path, unchanged
     │
     ▼
sendProactiveInsight(userId, title, body)  ← NEW: also texts, best-effort
     │
     ▼
for each verified, non-opted-out MessagingConnection:
   buildProactiveNudge(title, body)  → "Title\n\nBody\n\nText STOP to turn these off."
   BlueBubbles send (if configured) + logged to MessagingMessage either way
```

## Why this lives in `ai/src`, not `backend/src`

`workers` is its own app — it can't import `backend/src/services/*`, the
same boundary `hueActionExecutor.ts`'s Hue-token-refresh code already
documents ("this package, like workers, can't reach into the backend
app's internals"). `ai/src/messagingDelivery.ts` is a small, deliberate
duplicate of backend's BlueBubbles send call (~15 lines), reading
`MESSAGING_SEND_URL`/`MESSAGING_API_KEY` directly from `process.env` —
the same pattern `atlasChat.ts` already uses for `GEMINI_API_KEY` in
this same package, rather than a zod-validated env (that validation is
a backend-app concern only).

`messagingRepository` (connections + message log) is already a
dependency of `ai/src` — `atlasChat.ts` and `messagingTools.ts` both
read from `@moodsync/database` directly — so `messagingDelivery.ts`
reusing it is consistent, not a new architectural seam.

## Opt-in / opt-out model

There's no separate "enable proactive texts" toggle. The instant a
`MessagingConnection` is verified, it's eligible for both on-demand
replies *and* proactive insights — the verification step itself is the
opt-in (you had to be signed into the app and text back a code from your
own phone), matching how STOP already works as the universal kill
switch for everything sent through this channel, not just insights.
Every proactive text ends with the STOP line
(`buildProactiveNudge`), same as before.

This was a deliberate simplicity choice: a second granular toggle
("insights: on, but only replies: on" or vice versa) is more UI and more
state for a benefit that doesn't obviously exist — Poke's own value
proposition is that unprompted-but-relevant beats
you-have-to-ask, and MoodSync's insight checkers already only fire on
real, deduped signals, not a fixed schedule. If usage shows people want
replies without unsolicited texts, that's a real follow-up, not
something to build speculatively now.

## What determines *when* a text goes out

Nothing new — literally the existing worker's cadence and dedupe. A
proactive text is exactly as frequent as an in-app proactive
notification already was; this round changed the destination, not the
trigger logic. Extending "what counts as insight-worthy" (e.g. wiring
`computeWeeklyInsights`/`computeBiggestImprovement`'s weekly-report
narrative into a text, or the calendar signal `checkBurnoutRisk`
currently can't see from this worker) is real, scoped, additive work —
not built this round, listed below.

## Verification

Unit-tested: `sendProactiveInsight` — no connection → no send;
unverified/opted-out/WhatsApp connections skipped; message logged with
`externalId: null` when no provider is configured or the provider call
throws; real `externalId` recorded on a successful send; opt-out line
and both title/body present in the sent text. Full monorepo
build/lint/test passing after the change.

Not live-tested: an actual worker tick against a real BlueBubbles
server producing a real received text — no live BlueBubbles account in
this environment, same disclosed gap as docs/MESSAGING_BOT.md.

## Known gaps

- **No separate proactive-texting toggle** (see "Opt-in/opt-out model"
  above) — a deliberate simplicity choice, not an oversight, but worth
  revisiting if real usage asks for it.
- **Calendar signal still missing from `checkBurnoutRisk`/`checkSocialBatteryLow`**
  inside this worker (pre-existing gap, documented in the worker's own
  comment — unrelated to texting, but it caps how good those two texts
  can be until it's fixed).
- **Stress Timeline isn't wired to a proactive check.**
  `ai/src/stressTimeline.ts`'s `computeStressTimeline` needs intraday
  heart-rate samples bucketed through the day — real, and already
  powers the in-app Stress Timeline view — but a periodic worker tick
  doesn't cheaply have "today's samples so far" the way it has a
  single latest reading; wiring a same-day "stress has been climbing
  since 2pm" text is real, scoped future work, not built this round.
- **Wellness Memory correlation findings** (`ai/src/wellnessMemory.ts`'s
  `correlateOccurrences`/`describeFinding` — "you focus best around
  9am"-style findings) aren't wired to text either. These are naturally
  a weekly-or-rarer cadence (a correlation found once shouldn't repeat
  every tick), which is exactly the pattern the new weekly-worker
  texting just established — a good next home for them, not built here.
- **Not live-verified** against a real BlueBubbles server (see above).
