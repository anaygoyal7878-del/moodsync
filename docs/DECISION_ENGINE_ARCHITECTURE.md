# MoodSync Decision Engine — Architecture

This is "Decision Engine core" (Milestone 10): a real, fully-verified extension of the
existing rule engine / dispatch / insights pipeline (`ai/src/*`, built in Milestones 4 and 9),
not a rewrite. Every component below is either fully built this round, minimally scoped and
built, or explicitly deferred to `docs/DECISION_ENGINE_ROADMAP.md` — labeled as such, never
presented as more complete than it is.

## 1. Component map

| Spec component | Status | Where |
|---|---|---|
| Context engine | Minimal: latest reading + current time (time-window matching) | `ai/src/ruleEngine.ts`'s `withinTimeWindow` |
| Rule engine | Extended | `ai/src/ruleEngine.ts` |
| Preference engine | Minimal: one global pause override | `database/src/repositories/userPreferencesRepository.ts` |
| Automation engine | Extended | `ai/src/dispatch.ts` |
| Notification engine | New, real | `ai/src/notificationExecutor.ts`, `database/src/repositories/notificationRepository.ts` |
| AI insight engine | Extended (trend series generalized to wellness scores) | `ai/src/insights.ts`'s `computeWellnessTrends` |
| Event pipeline | Existing: reading insert → `dispatchForReading` | `ai/src/dispatch.ts` call sites (sync workers, ingest routes, scheduled tick) |
| Scheduling system | New, minimal | `workers/src/scheduledDispatch.ts` |
| Priority queue / conflict resolution | New | `ai/src/dispatch.ts`'s `resolveConflicts`/`resourceKeyFor` |
| Manual override system | New, minimal (one global pause, not per-resource) | `backend/src/api/routes/preferences.ts` |
| Safety checks | New: rate limit + param bounds | `ai/src/dispatch.ts`'s `RATE_LIMIT_PER_HOUR` |
| Logging | Existing, extended with `reason` | `AutomationExecutionLog.reason` |
| Explainability layer | New | `ai/src/explain.ts` |

## 2. Data flow

```
                    ┌─────────────────────────────────────────┐
                    │  Event source (pick one)                  │
                    │  - Wearable sync worker (new reading)      │
                    │  - Ingest route (Apple Health / Amazfit)   │
                    │  - Scheduled tick (time-window only)       │
                    └───────────────────┬─────────────────────┘
                                          │ NormalizedBiometricReading
                                          │ + current time
                                          ▼
                    ┌─────────────────────────────────────────┐
                    │  dispatchForReading()  (ai/src/dispatch.ts) │
                    └───────────────────┬─────────────────────┘
                                          │
                    1. Rule engine: evaluateRules()
                       - AND biometric conditions
                       - AND time window (if set)
                                          │ matched rules
                                          ▼
                    2. Manual pause check (preference engine)
                       - if paused: log+notify SKIPPED_MANUAL_PAUSE, stop
                                          │
                                          ▼
                    3. Conflict resolution (priority queue)
                       - group matched rules by resource key
                       - keep highest priority per resource
                       - log+notify SKIPPED_CONFLICT for losers
                                          │ winners
                                          ▼
                    4. Per winning rule: cooldown check
                       - log SKIPPED_COOLDOWN if within window
                                          │
                                          ▼
                    5. Safety check: hourly rate limit
                       - log+notify SKIPPED_SAFETY_RATE_LIMIT if over
                                          │
                                          ▼
                    6. Explainability: explainTrigger() builds `reason`
                                          │
                                          ▼
                    7. Automation engine: execute actions
                       - hue.* → executeHueAction
                       - spotify.* → executeSpotifyAction
                       - EXECUTED / FAILED, with `reason`
                                          │
                                          ▼
                    8. Logging: AutomationExecutionLog.record(outcome, reason)
                                          │
                                          ▼
                    9. Notification engine: createNotification()
                       - every outcome, not just EXECUTED
                                          │
                                          ▼
                    ┌─────────────────────────────────────────┐
                    │  Dashboard: WellnessScoreCard,             │
                    │  automation history, NotificationHistory   │
                    └─────────────────────────────────────────┘
```

Separately, `computeWellnessScores()` (ai/src/wellness.ts) runs on-demand
(`GET /api/wellness`) from the latest reading + a 30-day trailing window —
it does not gate or influence dispatch directly this round (a rule's
`conditions` still reference raw biometric fields, not computed wellness
scores — see roadmap for wiring scores into conditions).

## 3. Priority + conflict resolution

Every `AutomationRuleDefinition` has a `priority: number` (0-100, default
50). Within one `dispatchForReading` call, every matched rule's actions
are grouped by a coarse resource key: `${provider}:${actionType}` (e.g.
`hue:set_brightness`, `spotify:play_playlist`) — see `resourceKeyFor` in
`ai/src/dispatch.ts`. If two or more matched rules target the same
resource, only the highest-priority one executes; the rest are logged
`SKIPPED_CONFLICT` with an explanation naming both rules. Ties are broken
deterministically by rule id.

This is deliberately coarse (provider + action type, not
per-device/per-playlist) for v1 — a finer-grained resource key (e.g.
per-`deviceId`) is a documented roadmap refinement, not built here.

## 4. Manual override

Scoped to exactly what was needed and verified: `UserPreferences.automationsPausedUntil`
(a `DateTime?`), settable via `POST /api/preferences/automation-pause`
(`{minutes}`, capped at 24h) and cleared via `DELETE`. Dispatch checks this
first, before conditions/priority/cooldown — if paused, every matched rule
is skipped with `SKIPPED_MANUAL_PAUSE` and a real notification. This is a
single, simple, global pause, not per-resource or per-rule overrides — see
the roadmap for that refinement.

## 5. Safety checks

- **Rate limit**: `RATE_LIMIT_PER_HOUR = 20` (constant in `ai/src/dispatch.ts`)
  — a hard ceiling on successful executions per user per hour, independent
  of individual rule cooldowns, logged `SKIPPED_SAFETY_RATE_LIMIT`. Exists
  to stop a misconfigured or bouncing rule set from hammering a user's
  smart-home devices.
- **Parameter bounds**: existing Hue executor validation (`hue.set_brightness`
  requires a numeric `brightness`, etc.) — inspected during this round;
  no additional bounds were added since the executor already throws on
  malformed params rather than silently clamping.

## 6. Explainability

`ai/src/explain.ts` turns a matched rule's `RuleCondition[]` and the
actual reading values into a human-readable string — e.g. *"Triggered
because 92 heart rate exceeded your threshold of 80."* Stored on
`AutomationExecutionLog.reason` and reused verbatim as the generated
notification's body, so the same explanation is visible in both the
automation history and the notification feed. Every non-EXECUTED outcome
(`SKIPPED_CONFLICT`, `SKIPPED_MANUAL_PAUSE`, `SKIPPED_SAFETY_RATE_LIMIT`)
has its own explanation function (`explainConflict`, `explainManualPause`,
`explainRateLimit`).

## 7. Scheduling system

Two automation templates (Focus Mode, Sleep Preparation) are
schedule-triggered, not biometric-triggered — the existing dispatch
pipeline only ever runs off a fresh reading. `workers/src/scheduledDispatch.ts`
is a periodic tick (same cron-worker pattern as the wearable sync
workers, `npm run start:scheduled-dispatch -w workers`) that, for every
user with at least one enabled time-window rule, fetches their latest
known reading (or a synthetic userId/timestamp-only reading if they've
never synced) and re-runs the same `dispatchForReading` path. A rule with
`timeWindow` set and empty `conditions` matches purely on time; a rule
with both requires both to hold.

## 8. What's real vs. minimally scoped this round

Verified live (see `docs/MILESTONES.md`'s Decision Engine core entry for
the full verification transcript): wellness score computation (including
the 5-point HRV-baseline threshold), priority-based conflict resolution
(two same-resource rules, correct winner, correct loser explanation),
manual pause (both matched rules correctly skipped), and the notification
engine (every outcome surfaced with its real explanation) — all against a
live local Postgres, a real signed-up account, and real ingest traffic,
rendered in the actual dashboard UI.

Not built this round, and explicitly not claimed as built: a pluggable
action-executor registry (still a hardcoded if/else on provider — see
roadmap), per-resource manual overrides, a true multi-signal context
engine (calendar, location, environment), weekly AI-generated reports, and
music-preference learning. See `docs/DECISION_ENGINE_ROADMAP.md`.
