# Sleep Coach

`/dashboard/sleep` — a bedtime the user can act on, a wind-down routine
built from their actual home, and how the last few nights went.

## Bedtime target

Worked backwards from the user's **first real commitment tomorrow**, read
from their connected Google Calendar:

```
windDownAt = firstCommitment − 60min (get ready) − 8h (sleep) − 30min (wind-down)
```

- 8 hours is the midpoint of the CDC/National Sleep Foundation's
  recommended 7–9 hour adult range — the same anchor `computeSleepScore`
  already uses.
- The 60-minute morning buffer and 30-minute wind-down allowance are
  MoodSync's own figures, not research findings, and are labelled as
  such in `ai/src/sleepCoach.ts`.

**With no calendar connected this returns `null`,** and the page says so
with a connect prompt. A bedtime target built on a guessed wake time is
worse than no bedtime target — it looks authoritative and isn't.

## Wind-down routine

Steps are only included when the signal behind them exists:

| Step | Requires | Omitted when |
|---|---|---|
| Temperature | HomeKit bedroom sensor + configured sleep range | Either is missing |
| Breathing | Stress score ≥ 60 | Stress is normal or unavailable |
| Scene | A HomeKit scene whose name matches sleep/night/bed | No such scene → generic "dim the lights" instead |
| Screens | — | Never; always the last step |

This is the difference between a coach and a listicle: a step with no
backing signal is left out rather than filled in with generic sleep
hygiene.

## Sleep quality

`summarizeSleepQuality` reports the average score, average total time
asleep, nights measured, and last night vs. the prior nights.

**Total time asleep is `null` for providers that report a score without
stages.** WHOOP and Google Health (Fitbit) return stage breakdowns; Apple
Health and Amazfit return the score alone. The page states this rather
than showing a blank or a zero.

## Not built: bedtime consistency

The original brief asked for "see bedtime patterns." MoodSync stores a
sleep *score* and stage minutes per reading
(`NormalizedBiometricReading`) but **no sleep-session start or end
timestamps** — no provider integration in this app ingests them.

So "your bedtime has drifted 40 minutes later this week" is not something
this app can say honestly. It is not approximated from data that can't
support it. Adding it would require ingesting sleep-session times from
WHOOP's `/v1/activity/sleep` (`start`/`end`) and Fitbit's sleep log
`startTime`/`endTime`, plus schema columns to hold them — a real,
scoped piece of work, not a display change.
