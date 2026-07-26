# Google Health (Fitbit) Sync — Continuous Pipeline Refactor

## 0. Context

The Google Health integration ("Fitbit" at the product/UI layer — see
`integrations/fitbit/src/index.ts` for why the technical backing is
actually Google's Health API, not the legacy Fitbit Web API) already
syncs on a 5-minute Railway cron (`workers/railway.sync-all.json`) and
already triggers `dispatchForReading` synchronously after every sync
(`workers/src/lib/runProviderSync.ts`). This round closes three real
gaps found by auditing the existing pipeline against a "make it feel
live" request, without over-building what wasn't asked for:

**Explicitly scoped out this round, per direct instruction:**
- **Cron cadence stays at 5 minutes.** Tightening to 2-3 minutes was
  considered and declined — the existing 5-minute interval is already
  tuned against Google's rate limit math (see `docs/MILESTONES.md`), and
  cadence wasn't judged the highest-value gap to close.
- **No SyncLog/sync-history model, no sync-history UI, no
  "Integration Health" dashboard.** Explicitly declined — this round
  focuses on the sync pipeline's actual correctness and resilience, not
  a new observability surface.
- **No full workout/session model.** `exercise` (Google Health's session
  data type) is a discrete event with its own start/end/type — it
  doesn't fit `NormalizedBiometricReading`'s one-row-per-day shape
  without losing information, and modeling a proper workout-session
  table is a larger, separate piece of work than fits this round's
  "sync pipeline" scope. `GoogleHealthClient.listExercise()` exists
  (confirmed-shipped API, added for future use) but nothing calls it yet.

## 1. What changed

### 1.1 Real incremental sync (the actual bug this round fixes)

**Before**: every sync call computed `since = Date.now() - sinceDays`
fresh, with no memory of the last successful sync. The 5-minute cron
worker always passed `sinceDays: 1`, re-requesting a fixed trailing
24-hour window on every single run regardless of when the last sync
actually happened — correctness relied entirely on the
`BiometricReading` unique constraint (`userId, provider, timestamp`) +
`skipDuplicates` silently absorbing the redundant re-fetch.

**After**: `fetchAndNormalizeGoogleHealthData` accepts an optional
`since: Date` — when provided, it's used directly as the fetch window's
start instead of computing one from `sinceDays`. Both callers
(`workers/src/providers/fitbit.ts`, `backend/src/services/fitbitService.ts`)
now pass `connection.lastSyncedAt` (minus a 5-minute safety-overlap
buffer for clock skew) as this cursor, falling back to the old
`sinceDays`-based window only when `lastSyncedAt` is null (a genuinely
first-ever sync). `sinceDays`/the manual-sync `days=7` default are
unchanged as the first-sync fallback — this is additive, not a breaking
change to either caller's existing behavior on day one.

This doesn't change per-call payload size dramatically at a 5-minute
cadence (the old 1-day window was already generous relative to actual
elapsed time), but it's the correct primitive: a connection that hasn't
synced in 3 hours (a missed cron run, a redeploy gap) now correctly
requests 3 hours of backfill instead of silently only ever looking back
1 day, and a connection syncing exactly on schedule requests almost
exactly the elapsed interval, not a fixed day.

### 1.2 New metrics: Active Minutes, Heart Rate Zone Minutes

Confirmed live (via `developers.google.com/health/release-notes`, this
session) as shipped, not "coming soon": `active-minutes` and
`time-in-heart-rate-zone` are real Activity & Fitness data types.
`exercise` (workouts) is also shipped but not wired up — see §0.

**Confidence caveat, applied consistently**: unlike every other field in
`integrations/fitbit/src/client.ts` (each of which was fixed against a
reproduced live 400 error from a real linked account — see
`CivilDateTime`'s and `listDailyRestingHeartRate`'s doc comments for two
real examples of the documented shape being wrong), no live Google
Health account was available this round to verify the exact response
field names for these two new types. They're implemented from
documentation only, with:
- Individually-caught fetches (`'.catch(() => [])'` in `sync.ts`) so a
  wrong endpoint/field guess can't take down steps/heart-rate/sleep —
  the metrics this integration has depended on since it shipped.
- Defensive parsing in `normalize.ts` (`sumActiveMinutes`, the
  heart-rate-zone loop) that degrades to 0/skip on an unexpected shape
  rather than throwing.
- New `NormalizedBiometricReading.activeMinutes`/`.heartRateZoneMinutes`
  fields (`shared/src/wearables.ts`), new `BiometricReading` columns
  (migration `20260726170000_add_active_minutes_hr_zone`) — both
  nullable, so a wrong/empty response just means these two fields stay
  unset for a reading, same failure mode as every other optional metric
  in this model.

### 1.3 Retry with exponential backoff

`GoogleHealthClient`'s private `request()` now retries up to 3 times on:
- **429** (Google's rate limit) — honors a real `Retry-After` response
  header when present, falls back to exponential backoff with jitter
  (`500ms * 2^attempt + jitter`) otherwise.
- **5xx** (transient server-side failures).
- **Network-level failures** (no response at all — DNS, connection
  reset, timeout).

**Never retried**: 400/401/403/404 — these indicate a request that will
fail identically on retry (malformed filter syntax, expired/invalid
token, wrong scope, unknown resource), so retrying would just burn rate
-limit budget and delay the real error (token refresh, reconnect
prompt) surfacing to the user.

## 2. Why the rest of the "continuously synchronized" spec doesn't need new work here

- **AI recalculation already happens on every sync** —
  `dispatchForReading` is called synchronously in both sync paths after
  a successful insert (confirmed by reading `runProviderSync.ts` and
  `fitbitService.ts` before starting this round). `computeWellnessScores`
  is computed on-demand (never cached), so there's no "stale score" to
  invalidate — every dashboard/insights read is already fresh relative
  to whatever's in `BiometricReading` at read time.
- **"Live dashboard, no manual refresh"** — the existing
  `ConnectionsSection.tsx`/`SyncButton.tsx` pattern already triggers
  `router.refresh()` after a manual sync; the 5-minute cron means data
  is never more than 5 minutes stale on next page load/refresh
  regardless.
- **Provider-agnostic architecture for future WHOOP/Apple Health/Oura/
  Garmin/Polar** — already real, not new this round: `ProviderSyncRunner`
  (`workers/src/lib/runProviderSync.ts`) and `syncAll.ts`'s job-list
  pattern already support adding a new poll-based OAuth provider as
  `integrations/<provider>/{oauth,client,normalize,sync}.ts` +
  `workers/src/providers/<provider>.ts` + one line in `syncAll.ts`. Apple
  Health remains architecturally different (push-based, via the iOS
  companion app hitting `/api/integrations/apple-health/ingest`) — this
  was already true before this round and isn't something a
  `ProviderSyncRunner` implementation can absorb.

## 3. Verification

- `npm run build` (root) — all workspaces build clean.
- `npm test` across `integrations/fitbit` (18 tests, including 5 new:
  active-minutes bucketing, heart-rate-zone summing, malformed-shape
  resilience, 429-retry-then-succeed, non-retryable-401-fails-immediately),
  `ai`, `backend`, `database`, `integrations/whoop` — all pass.
- No live Google Health account was available in this sandbox to
  exercise the new endpoints or the incremental-cursor behavior against
  real data — same "compile/unit-test verified, not live-account
  verified" tier as this session's earlier metric additions, honestly
  distinct from the fields in this same file that WERE fixed against a
  reproduced live error in prior work.

## 4. Files

- `integrations/fitbit/src/client.ts` — `listActiveMinutes`,
  `listHeartRateZoneMinutes`, `listExercise` (unused this round),
  retry/backoff wrapper around `request()`.
- `integrations/fitbit/src/normalize.ts` — active-minutes/heart-rate-zone
  bucketing, `dayKeyFromIso`/`dayKeyToDateParts` helpers.
- `integrations/fitbit/src/sync.ts` — `since` cursor param, individually-
  caught new-metric fetches.
- `shared/src/wearables.ts` — `activeMinutes`, `heartRateZoneMinutes`.
- `database/prisma/schema.prisma` + migration
  `20260726170000_add_active_minutes_hr_zone`.
- `database/src/repositories/biometricReadingRepository.ts` — new fields
  threaded through `bulkInsert`/`toNormalized`.
- `workers/src/providers/fitbit.ts`,
  `backend/src/services/fitbitService.ts` — real `lastSyncedAt`-based
  cursor with safety-overlap buffer.
