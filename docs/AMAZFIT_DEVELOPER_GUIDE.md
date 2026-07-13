# Amazfit (Zepp OS) — Developer Preparation Guide

This is the step-by-step guide for everything **you** need to do before
the Amazfit integration can run on a real watch. It assumes you have
never used Zepp OS, the Zeus CLI, or the Zepp Simulator before.
Everything below requires either a Zepp developer account, the Zepp
Simulator app, or a physical Amazfit device — none of it can be done in
this environment (see
[docs/AMAZFIT_ARCHITECTURE.md](./AMAZFIT_ARCHITECTURE.md) for why, and
`zepp/MoodSyncCompanion/README.md` for exactly what was and wasn't
verifiable here).

The Mini Program *code* (`zepp/MoodSyncCompanion`) is done, written
against real, confirmed Zepp OS APIs. What's below is account/tooling
setup, plus the two placeholders that only you can fill in (a real
`appId` and your backend's URL).

## 1. Zepp developer account

1. Go to [developer.zepp.com](https://developer.zepp.com) and register —
   unlike Zepp Health's corporate "Data Cooperation" API, this is a free
   consumer signup (email, Google, Facebook, WeChat, Line, or Xiaomi
   account), no business application or approval wait required.
2. No paid tier is needed for development or Developer Mode installs —
   confirmed from the Zeus CLI's own documentation, which describes
   `zeus preview` as a review-free path to a running Mini Program on a
   real device.

## 2. Install the Zeus CLI

1. Requires Node.js >= 14.
2. `npm install -g @zeppos/zeus-cli`
   - If you hit an `EEXIST`/permission error on the npm cache (this
     sandbox did), either fix your global npm permissions or install
     locally into a project directory instead:
     `npm install @zeppos/zeus-cli --prefix ./zeus-tools` and invoke it
     via `./zeus-tools/node_modules/.bin/zeus`.
3. `zeus login` — opens a browser flow against your Zepp developer
   account from step 1.
4. `zeus --help` to confirm the CLI runs. If it fails with
   `Cannot find module 'zeppos-app-utils'`, install that as a sibling
   dependency (`npm install zeppos-app-utils`) — this sandbox hit exactly
   this error and it's a known missing-peer-dependency issue with some
   Zeus CLI versions, not a sign the CLI itself is broken.

## 3. Register the project and get a real `appId`

`zepp/MoodSyncCompanion/app.json` in this repo ships with a placeholder
`appId` (`1000001`) — Zepp OS assigns a real one when you register the
project:

1. `zeus create` in an empty directory, following the prompts (project
   name, template — choose the plain "App" template, not a watchface).
   This generates a fresh `app.json` with your real, assigned `appId`.
2. Copy that real `appId` into `zepp/MoodSyncCompanion/app.json`'s
   `app.appId` field, replacing the placeholder. Everything else in this
   repo's `app.json` (permissions, target devices, module paths) can stay
   as-is, or you can merge the generated project's scaffolding around
   this repo's `app.js`/`page/`/`app-side/`/`setting/` files — either
   order works, since `zeus create` mainly generates config, not the
   application logic this repo already has.
3. `deviceSource` values in the `targets` section (`gtr4`, `gts4`,
   `balance`) were taken from a real official sample project, not
   independently enumerated for every current Amazfit model — if you're
   targeting a specific watch and installs fail, check `zeus config` or
   the Zepp OS device list docs for that model's correct code.

## 4. Point the Side Service at your backend

`zepp/MoodSyncCompanion/app-side/index.js` has a `MOODSYNC_API_BASE`
constant set to a placeholder URL. Change it to wherever your backend is
actually reachable from the watch/phone:

- **Local development**: your backend needs a public HTTPS URL the Zepp
  app on your phone can reach — `localhost` won't work since the Side
  Service runs inside the Zepp app on your phone, not on your dev
  machine. Use a tunnel (this repo already uses ngrok for the Alexa
  skill's local testing — the same approach works here: point ngrok at
  your backend's port and use the `https://*.ngrok-free.dev` URL).
- **Production**: your real deployed backend's HTTPS origin.

No build-time environment variable injection is confirmed to exist for
Zepp OS Side Services (unlike, say, a bundler's `.env` support) — this is
a plain hardcoded constant you edit per environment, same limitation as
`ALEXA_TUNNEL_BACKEND_URL`'s manual setup.

## 5. Run it: Zepp Simulator or a physical device

Two ways to actually execute this code — neither available in this
sandbox:

**Option A — Zepp Simulator (recommended for iterating on UI/logic):**
1. Download the Zepp Simulator from the Zepp OS developer portal (a
   desktop GUI app — this is the piece that made further CLI
   troubleshooting a dead end in this sandbox, since it has no headless
   mode).
2. `zeus dev` in the project directory to start a local dev server.
3. Connect the Simulator to that dev server (the CLI prints the
   connection details).

**Option B — physical Amazfit device (recommended for real sensor data):**
1. Install the Zepp app on your phone, sign into the same account used
   for `zeus login`.
2. Pair your Amazfit watch with the Zepp app, if not already paired.
3. In the Zepp app: **Profile → Bound Devices → [your device] → scroll to
   bottom → Developer Mode** — enable it. This is what allows installing
   a Mini Program without app-store review.
4. From the project directory, run `zeus preview` — this prints a QR
   code.
5. Scan that QR code with your phone's camera or the Zepp app's
   Developer Mode scanner. The Mini Program installs to your watch over
   Bluetooth via the Zepp app.

## 6. Testing the flow end to end

1. On the watch: open the MoodSync Mini Program.
2. On the phone: open the Zepp app → the Mini Program's settings page
   (this is `setting/index.js`, the Settings App) → enter your MoodSync
   email/password → tap **Log in**.
3. Back on the watch: tap **Sync**. This reads the current
   heart-rate/sleep/step sensor values, relays them to the Side Service,
   which POSTs them to your backend's
   `/api/integrations/amazfit/ingest`.
4. Check the MoodSync dashboard's Connections card for "Amazfit" — it
   should flip to Active with a recent sync time.

If you don't have a watch or Simulator handy yet but want to verify the
*server-side* half of this integration right now, run
`node scripts/demoAmazfitSync.mjs <email> <password>` — it pushes a
simulated snapshot through the real ingest endpoint without touching any
Zepp OS code, letting you check the dashboard card, persistence, and
automation dispatch independently (see that script's header comment for
exactly what it does and doesn't cover).

## 7. Known gaps carried over from this round

- No confirmed device-battery sensor API — the Connections card
  correctly shows no battery indicator for Amazfit, not a bug.
- Sync only happens when the Mini Program is open and "Sync" is tapped —
  no scheduled/background sync was implemented or confirmed possible
  this round (see `docs/AMAZFIT_ARCHITECTURE.md` §10).
- `TextInput`'s documented API has no password/masked variant — the
  login form's password field is plain text on-screen, same as the
  underlying Zepp OS component.
