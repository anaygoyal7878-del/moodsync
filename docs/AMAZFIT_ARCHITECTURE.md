# Amazfit (via Zepp OS) — Architecture

Every claim below was verified against live `docs.zepp.com` documentation
and the Zeus CLI's own reference docs during this design pass. Where a
fetch didn't return the exact detail needed, it's flagged as such rather
than guessed at — see the "what wasn't independently confirmed" note in
docs/INTEGRATIONS_RESEARCH.md's Amazfit section.

## 1. Why this looks like Apple Health, not WHOOP/Fitbit

Amazfit devices sync through the **Zepp app**, operated by Zepp Health.
Zepp Health has a real cloud OAuth API ("Data Cooperation," documented at
`dev.huami.com`) with rich scopes (continuous heart rate, raw motion
data) — but it's gated to approved corporate partnerships only, with no
self-serve path to a client ID. That rules it out the same way it ruled
out Garmin/Ecobee (see docs/INTEGRATIONS_RESEARCH.md).

But Zepp Health separately operates **Zepp OS** — a genuinely self-serve
platform (free consumer account, no business application) for building
**Mini Programs**: small apps that run on the watch itself, with an
optional phone-side companion process. This is architecturally the same
shape as Apple Health: **no cloud API exists for a third-party server to
pull a user's history**, so the only way in is a device-side app that
reads sensors locally and pushes the data to MoodSync's own backend.
Decision: build a Zepp OS Mini Program, the same category of solution as
`ios/MoodSyncCompanion`, not a third integration pattern.

## 2. System architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Amazfit watch                              │
│                                                                      │
│  ┌────────────────┐                                                │
│  │  HeartRate /    │   Device App (on-watch JS)                     │
│  │  Sleep / Step   │──▶ reads sensors via hmSensor / newAPI          │
│  │  sensors        │    sensor modules                              │
│  └────────────────┘         │                                      │
│                               │ messageBuilder.request()             │
│                               ▼ (Messaging API, over Bluetooth)      │
└──────────────────────────────┼──────────────────────────────────────┘
                                 │
┌────────────────────────────────┼──────────────────────────────────┐
│                     Zepp App (phone)                                │
│                                 ▼                                    │
│                    ┌─────────────────────┐                          │
│                    │   Side Service        │  .on('call') receives  │
│                    │   (no UI, runs        │  the sensor payload     │
│                    │   inside Zepp App)     │                         │
│                    └─────────┬─────────────┘                          │
│                               │ Fetch API: fetch({ url, method,       │
│                               │ headers, body })                      │
└───────────────────────────────┼──────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
                    ┌──────────────────────────────┐
                    │      MoodSync backend          │
                    │                                 │
                    │  POST /api/auth/login          │
                    │  POST /api/integrations/       │
                    │       amazfit/ingest           │
                    │  DELETE /api/integrations/     │
                    │       amazfit                  │
                    │                                 │
                    │  → wearableConnectionRepository │
                    │    (tokenless connection)       │
                    │  → biometricReadingRepository   │
                    │  → dispatchForReading()         │
                    └──────────────────────────────┘
```

Everything below "HTTPS" is identical to every other provider — same
tables, same repository, same automation dispatch. Everything above it
is the Mini Program, because there's no alternative (same framing as
Apple Health's architecture doc §1).

## 3. Authentication flow

Same pattern as the iOS companion app — reuses the existing MoodSync
account rather than a separate device-pairing flow, since there's no
OAuth provider to delegate to here either:

1. User opens the MoodSync Mini Program's Side Service settings page (a
   Settings App, the Mini Program's UI-bearing component) and enters
   their existing MoodSync email/password.
2. Side Service calls `POST /api/auth/login` (the same endpoint the web
   app and iOS companion use) via the Fetch API, gets back the same
   access/refresh JWT pair.
3. Side Service stores the tokens via the **Settings API** (Zepp OS's
   persistent key-value storage for a Side Service — confirmed to exist
   as one of the Side Service's three API modules alongside
   Messaging/Fetch, though its exact storage-quota/persistence
   guarantees weren't independently fetched).
4. On each sync, the Device App collects a sensor snapshot, relays it to
   the Side Service via the Messaging API, and the Side Service attaches
   `Authorization: Bearer <accessToken>` and POSTs to
   `/api/integrations/amazfit/ingest` — identical auth shape to Apple
   Health's ingest endpoint.

## 4. Data flow

```
1. Device App requests current sensor values:
   - hmSensor HeartRate: most recent measurement
   - hmSensor Sleep: today's sleep summary (system updates it every
     30 minutes by default; updateInfo() can force a refresh)
   - hmSensor Step: current day's step count
2. Device App builds a plain JSON-serializable snapshot and sends it to
   the Side Service via messageBuilder.request().
3. Side Service's message handler (.on('call')) receives it, attaches
   the stored MoodSync access token, and calls fetch() to POST it to
   MoodSync's /api/integrations/amazfit/ingest.
4. Backend validates (Zod), stores via biometricReadingRepository,
   updates the WearableConnection's lastSyncedAt, and dispatches
   automation rules off the latest reading — same as every other
   ingest-style provider.
```

There is no push/background-sync confirmed for this path in the same
sense as Apple Health's `HKObserverQuery` — sync happens when the user
opens the Mini Program (or, per the Sleep sensor's documented "updates
every 30 minutes by default" behavior, sleep data itself refreshes
periodically on-device regardless of whether the Mini Program is open,
but relaying that to MoodSync still requires the Mini Program's Device
App to be running to read and forward it). Framed honestly in the UI as
"sync when you open the Mini Program," not real-time.

## 5. Security model

- **Read-only** — the Device App never calls a HealthKit-equivalent
  write API; MoodSync only ever reads sensor values, matching the
  read-only stance of every other provider.
- **No third-party OAuth credentials stored anywhere** — same as Apple
  Health, since there's no OAuth provider in this flow at all. The only
  credential is the user's own MoodSync JWT pair, stored via the Side
  Service's Settings API.
- **Transport**: HTTPS to the same backend origin every other client
  uses.
- **Server-side**: `/api/integrations/amazfit/ingest` uses the exact
  same `preHandler: app.authenticate` JWT-verification middleware as
  every other authenticated route — `userId` comes from the verified
  JWT, never trusted from the request body.
- **Fetch API has no documented domain restriction** — worth noting as a
  security property of the *platform*, not something MoodSync
  controls: a Side Service could in principle call any HTTPS endpoint.
  MoodSync's own Mini Program only ever calls its own backend, but this
  is a good reason to keep the ingest endpoint's payload schema strict
  (Zod, `.max()` bounds) rather than trusting Mini Program input more
  than any other public-internet client.

## 6. Data types read, and what's genuinely available

Confirmed against live `docs.zepp.com` sensor reference pages:

| Metric | Zepp OS sensor | Status |
|---|---|---|
| Heart rate (current + recent) | `HeartRate` (newAPI sensor, API_LEVEL 2.0+) | ✅ Confirmed real API |
| Sleep summary | `Sleep` (newAPI sensor, API_LEVEL 2.0+, updates every 30 min) | ✅ Confirmed real API |
| Steps | `Step` (`hmSensor.createSensor(hmSensor.id.STEP)`) | ✅ Confirmed real API |
| Workouts | `Workout` (newAPI sensor) | ⚠️ Confirmed to exist as a doc page; not read by this integration yet — same "authorized but not synced" scope decision as Apple Health's workouts (see docs/APPLE_HEALTH_ARCHITECTURE.md §11) |
| Device battery | — | ❌ Not confirmed to exist as a Device App sensor API in what was researched — unlike Google Health's `pairedDevices`, no evidence of a battery-reading API was found. Left unclaimed rather than guessed at. |
| Continuous/raw heart rate history, motion sensor data | — | Only available via the gated corporate "Data Cooperation" API (see docs/INTEGRATIONS_RESEARCH.md), not Zepp OS's on-device sensor APIs, which expose current/recent values rather than historical logs. |

## 7. Error handling

- **Not logged in** (no stored MoodSync token): Side Service shows a
  "please log in" state in its Settings page rather than silently
  failing the sync.
- **Sensor unavailable** (e.g. device doesn't support a given sensor):
  the Device App's snapshot simply omits that field — every field in
  the ingest payload is optional, matching every other provider's
  "partial reading is a success, not a failure" convention.
- **Network/API errors**: Side Service's `fetch()` call is wrapped so a
  failed POST is retried on the next sync rather than crashing the Mini
  Program.
- **Backend-side**: identical to Apple Health's ingest route — Zod
  validation returns 400 with flattened errors, the shared auth
  middleware returns 401, no Amazfit-specific error handling needed
  beyond what every authenticated route already has.

## 8. Privacy considerations

- **Read-only**, reinforced here as the single most important
  commitment, same as every HealthKit-equivalent integration.
- **Revocation**: disconnecting in the MoodSync dashboard only revokes
  the server-side `WearableConnection` record — the Mini Program itself
  keeps running and would need to be uninstalled or logged out
  separately from the watch/phone side, the same asymmetry already
  documented for Apple Health and Alexa.
- **No data leaves the device except through this explicit, user-run
  Mini Program** — there is no background service running without the
  user having installed it via `zeus preview`'s Developer Mode QR flow
  or (eventually) Zepp's Mini Program store.

## 9. On-device vs. server-side split

| Responsibility | Runs on |
|---|---|
| Reading raw sensor values | Device App (watch) only |
| Relaying sensor data to the phone | Device App → Side Service, via the Messaging API |
| Normalizing raw sensor values → ingest payload shape | Side Service (phone) — mirrors Apple Health's on-device normalization, since the server never sees raw sensor data |
| Authenticating the MoodSync session, storing tokens | Side Service |
| Reaching MoodSync's backend | Side Service, via the Fetch API |
| Storing readings, automation dispatch, insights | Server — identical code path to every other provider |

## 10. What's deferred / explicitly out of scope this round

- **Workouts**: sensor exists, not synced — same rationale as Apple
  Health (no MoodSync schema for session-shaped data yet).
- **Background/scheduled sync**: this round syncs when the Mini Program
  is opened, not on a timer — Zepp OS may support scheduled Side Service
  wake-ups, but this wasn't independently confirmed and isn't assumed.
- **Device battery**: no confirmed sensor API for it — see §6.
- **Zepp Mini Program store distribution**: this round targets
  `zeus preview`'s Developer Mode QR install (no review needed), not
  submission to Zepp's Mini Program store for public discovery — see
  docs/AMAZFIT_DEVELOPER_GUIDE.md for what that would additionally
  require.
