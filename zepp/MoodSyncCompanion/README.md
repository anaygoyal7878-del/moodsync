# MoodSyncCompanion (Zepp OS Mini Program)

The Amazfit companion, built as a **Zepp OS Mini Program** — not an OAuth
integration. Zepp Health's cloud API ("Data Cooperation," `dev.huami.com`)
is real but gated to approved corporate partnerships with no self-serve
path (see `docs/INTEGRATIONS_RESEARCH.md`). Zepp OS is a separate,
genuinely self-serve platform: a free consumer developer account lets
anyone build a Mini Program that runs on the watch and pushes the user's
own data to a backend of their choosing. Architecturally this is the same
shape as `ios/MoodSyncCompanion` for Apple Health: no cloud API exists to
pull history from, so the answer is a device-side app, not OAuth.

See [docs/AMAZFIT_ARCHITECTURE.md](../../docs/AMAZFIT_ARCHITECTURE.md) for
the full system design and
[docs/AMAZFIT_DEVELOPER_GUIDE.md](../../docs/AMAZFIT_DEVELOPER_GUIDE.md)
for the Zepp account / Zeus CLI / device setup needed to actually run
this.

## Structure

- `app.json` — Mini Program manifest (permissions, target devices, entry
  points for the Device App / Side Service / Settings App).
- `app.js` — top-level app lifecycle (`BaseApp` + `appPlugin`).
- `page/index.js` — **Device App**: runs on the watch, reads
  `HeartRate`/`Sleep`/`Step` sensors via `@zos/sensor`, and on tapping
  "Sync" relays a snapshot to the Side Service via the Messaging API
  (`this.request({ type: 'SYNC', params })`).
- `app-side/index.js` — **Side Service**: runs inside the Zepp phone app
  (no UI). Logs into MoodSync (`POST /api/auth/login`), stores the JWT
  pair via the Settings API, and on receiving a `SYNC` message POSTs the
  snapshot to `POST /api/integrations/amazfit/ingest` with
  `Authorization: Bearer <accessToken>`, via the Fetch API.
- `setting/index.js` — **Settings App**: the phone-side login/status UI
  (email/password fields, login button, sync-now button, logout).

## Data synced

Heart rate (`HeartRate.getLast()`), sleep score
(`Sleep.getInfo().score`), and steps (`Step.getCurrent()`) — the three
sensor APIs confirmed against live `docs.zepp.com` reference pages and a
real official sample project. No device-battery field: unlike Google
Health's `pairedDevices`, no Zepp OS sensor API for battery level was
found — left unclaimed rather than guessed at (see
`docs/AMAZFIT_ARCHITECTURE.md` §6).

## What was verified for real, and what wasn't

This sandbox has no way to run the actual Zepp OS runtime — confirmed
directly, not assumed:

- `@zeppos/zeus-cli` installs via npm (confirmed,
  version 1.9.2), but running it (even `--help`) fails on a missing peer
  dependency (`zeppos-app-utils`); installing that separately broke the
  CLI's binary symlink further. Even a working CLI still needs the
  proprietary Zepp Simulator (GUI-only app) or a physical Amazfit device
  to actually execute this code — neither is available here.
- Every file's **API usage** — `@zos/sensor`'s `HeartRate`/`Sleep`/`Step`
  classes, `@zeppos/zml`'s `BaseApp`/`BasePage`/`BaseSideService` +
  plugin pattern, the Settings API's `settingsStorage`, the Fetch API's
  `fetch({url, method, headers, body})` shape, and the
  `AppSettingsPage`/`Button`/`View`/`TextInput` Settings App
  components — is copied from real, live `docs.zepp.com` reference pages
  and a real official sample Mini Program
  (`zepp-health/zeppos-samples`, `application/2.0/post-health-data`)
  fetched verbatim during development, not invented.
- The **backend endpoint** this talks to
  (`POST /api/integrations/amazfit/ingest`) is real, already registered
  in `backend/src/api/server.ts`, and uses the exact same
  Zod-validation/JWT-auth pattern as every other ingest route in this
  repo — that part *is* verifiable here and was checked by running the
  monorepo's test suite.

**Not independently confirmed, flagged rather than guessed at:**
- `TextInput`'s reference page documents no password/masked-input
  variant — the password field in `setting/index.js` is a plain
  `TextInput`, not a secure one. There may be a different, undocumented
  component for this; none was found.
- `app.json`'s `appId` and each target's `deviceSource` numeric code are
  **placeholders** — a real Mini Program needs an `appId` assigned by
  registering the project in the Zepp OS developer console (via
  `zeus login` + `zeus create`), and `deviceSource` codes weren't
  independently enumerated per real device beyond what appeared in the
  fetched sample project's own `app.json`. The target list here
  (GTR 4 / GTS 4 / Balance) is illustrative, not an exhaustive or
  verified device compatibility list.
- Scheduled/background sync (the Side Service waking up without the
  Mini Program being open) wasn't confirmed to exist as a capability —
  this round syncs only when the user opens the Mini Program and taps
  Sync, same limitation documented in
  `docs/AMAZFIT_ARCHITECTURE.md` §10.

## Required before this runs on a real watch

- A free Zepp account, registered via `developer.zepp.com`.
- The Zeus CLI (`npm i -g @zeppos/zeus-cli`), `zeus login`, `zeus create`
  to get a real `appId`, then this directory's contents dropped into the
  generated project (or the generated project's config merged into
  `app.json` here).
- `MOODSYNC_API_BASE` in `app-side/index.js` set to a real reachable
  MoodSync backend origin (a tunnel like ngrok for local dev, same
  pattern used for the Alexa skill's endpoint).
- `zeus preview` to generate a QR code, scanned via the Zepp App's
  Profile → Bound Devices → Developer Mode — no app-store review needed
  for this kind of testing.

See `docs/AMAZFIT_DEVELOPER_GUIDE.md` for the full step-by-step version
of the above.
