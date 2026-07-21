# Production Deployment (Railway)

Everything up to this point has run on a local Postgres + local dev
servers, with the Google Health sync driven by a personal crontab entry
on one machine. This doc replaces both with real, managed infrastructure
on [Railway](https://railway.com): one Postgres instance, one backend
service, one frontend service, and five worker services running as
Railway-managed cron jobs (`deploy.cronSchedule` — no crontab, no
always-on process for something that only needs to run periodically).

Config-as-code for each service already exists in the repo (see "Services"
below); the steps below are what you have to do in the Railway dashboard,
since I can't create hosting accounts, add billing, or provision
infrastructure on your behalf.

## 1. One-time account/project setup (you do this)

1. Create a Railway account and a new empty **Project** (e.g.
   `moodsync-production`).
2. Push this repo to GitHub if it isn't already there — Railway deploys
   from a GitHub repo, not a local `git push railway`.
3. In the project, **Add a Database → PostgreSQL**. Railway provisions it
   and exposes a `DATABASE_URL`-shaped connection string as a variable on
   that plugin — you'll reference it from every other service (see §3).

## 2. Services

Railway auto-detects each package in a JS monorepo and can stage one
service per package, but each service's **Config File Path** has to be
set explicitly in that service's Settings → Config-as-code (it does not
infer the file from the service's Root Directory). Create these 7
services, all with **Root Directory = `/`** (repo root — every build
command below relies on running from the root so the npm workspace build
order from [package.json](../package.json) applies):

| Service | Config File Path | Purpose |
|---|---|---|
| `backend` | `backend/railway.json` | Fastify API server |
| `frontend` | `frontend/railway.json` | Next.js app |
| `worker-sync-all` | `workers/railway.sync-all.json` | WHOOP + Fitbit biometric sync, every 5 min |
| `worker-scheduled-dispatch` | `workers/railway.scheduled-dispatch.json` | Time-window automation trigger, every 5 min |
| `worker-notification-digest` | `workers/railway.notification-digest.json` | Batches `HOURLY`-mode notifications, hourly |
| `worker-weekly-report` | `workers/railway.weekly-report.json` | Persists weekly `Insight` rows |
| `worker-spotify-playback-check` | `workers/railway.spotify-playback-check.json` | Skip-detection for Spotify recommendations, every 5 min |

For each: **New Service → GitHub Repo**, pick this repo, then set Root
Directory to `/` and Config File Path to the path above.

### Cron cadences — where each one comes from

- `sync-all`, `scheduled-dispatch`: `*/5 * * * *`. `sync-all`'s cadence is
  the one already documented and rate-limit-checked in
  [MILESTONES.md](MILESTONES.md) (WHOOP/Google Health quotas). The
  `scheduledDispatch.ts` docstring says to use "the same cron cadence
  convention as the wearable sync workers... e.g. every 5-10 minutes" —
  5 minutes was picked to match `sync-all` exactly.
- `notification-digest`: `0 * * * *` (hourly) — matches the worker's own
  docstring ("Run this on an hourly cron") and the `HOURLY` digest mode
  it implements.
- `spotify-playback-check`: `*/5 * * * *` — matches the worker's own
  `CHECK_DELAY_MS = 5 * 60_000` constant (rows aren't checkable until 5
  minutes after they're logged, so checking every 5 minutes is the
  tightest useful interval without re-checking the same row twice).
- `weekly-report`: `0 3 * * 0` (Sunday 03:00 UTC) — the worker's docstring
  only specifies "weekly," not a day or time. Sunday early-morning was
  picked as a reasonable low-traffic default; there's no documented
  requirement behind the exact hour, so change it freely if you want a
  different day/time.

## 3. Environment variables

Define these once at the Railway *project* level (Project Settings →
Shared Variables) to avoid retyping the same value repeatedly, **but
note that Railway does not auto-inject shared variables into every
service** — each service only gets a shared variable after you
explicitly click "Share" for it (or add it via that service's own
Variables tab → "Shared Variable"), which creates a
`${{shared.VARIABLE_KEY}}` reference on that service. Skipping this step
is a real, easy-to-hit failure mode: the backend boots, `prisma migrate
deploy` succeeds (if `DATABASE_URL` was added directly), and then the
zod env schema throws `Invalid environment configuration` naming
exactly the variables that were defined as shared but never shared into
that service. Confirm each service's own Variables tab actually lists
`DATABASE_URL` and the four secrets below — as real values or explicit
references, not just present on the Shared Variables page — before
assuming they're wired up.

### Required on every service that boots the backend's env schema (backend + all 5 workers)

These are validated by [`backend/src/config/env.ts`](../backend/src/config/env.ts)'s zod schema — the backend refuses to boot without them. Generate real values, don't reuse the CI placeholders:

| Variable | How to generate |
|---|---|
| `DATABASE_URL` | Copy from the Postgres plugin's `DATABASE_URL` variable reference (`${{Postgres.DATABASE_URL}}`) |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` (≥32 chars required) |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (≥32 chars required) |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to exactly 32 bytes) |
| `OAUTH_STATE_SECRET` | `openssl rand -base64 48` (≥32 chars required) |

### Required on `frontend`

| Variable | Value |
|---|---|
| `BACKEND_API_URL` | The backend service's public Railway URL (e.g. `https://backend-production-xxxx.up.railway.app`) |

### Per-integration (optional — only set the ones for integrations you're actually enabling; each is `.optional()` in the schema, so an unconfigured integration is skipped, not a boot failure)

| Integration | Variables |
|---|---|
| WHOOP | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` |
| Hue | `HUE_CLIENT_ID`, `HUE_CLIENT_SECRET`, `HUE_REDIRECT_URI` |
| Google Health (Fitbit) | `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_REDIRECT_URI` |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` |
| Alexa | `ALEXA_SKILL_CLIENT_ID`, `ALEXA_SKILL_CLIENT_SECRET`, `ALEXA_VENDOR_ID`, `ALEXA_TOKEN_SECRET` (≥32 chars) |

Every `*_REDIRECT_URI` needs to point at the **backend's** public Railway
URL (e.g. `https://backend-production-xxxx.up.railway.app/api/integrations/whoop/callback`)
and be re-registered with that provider's developer console — the
`localhost` redirect URIs used in local dev won't work in production.

`CORS_ORIGIN` (optional, defaults to `http://localhost:3001`) should be
set on `backend` to the frontend's real production URL once you have it,
so the browser's CORS preflight succeeds.

The 5 worker services only need the subset of the table above that their
own code touches: `sync-all` needs `WHOOP_CLIENT_ID/SECRET/REDIRECT_URI`
and `GOOGLE_HEALTH_CLIENT_ID/SECRET/REDIRECT_URI` (config/env.ts covers
this since the workers import `@moodsync/database`, which reads
`DATABASE_URL` directly); `spotify-playback-check` needs
`SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI`. Setting all of them as shared
project variables (as recommended above) makes this a non-issue — every
service just gets what it needs and ignores the rest.

## 4. Database migrations

`backend/railway.json`'s `deploy.preDeployCommand` runs
`npm run db:migrate:deploy -w database` (i.e. `prisma migrate deploy`)
before every backend deploy, so schema migrations apply automatically —
no manual migration step needed after the first deploy.

## 5. First deploy checklist

1. Set the shared project variables (§3).
2. Deploy `backend` first, confirm it boots (check its logs — the zod
   schema throws a readable error naming exactly which variable is
   missing if something's wrong) and that `/health` responds on its
   public URL.
3. Set `BACKEND_API_URL` on `frontend` to that URL, then deploy
   `frontend`.
4. Update `CORS_ORIGIN` on `backend` to the frontend's public URL, redeploy
   backend.
5. Deploy the 5 worker services. Each is a cron job, not a long-running
   process — Railway will show them as "Crashed"/exited-0 between runs,
   which is expected (the process exits after each scheduled run
   completes; that isn't a failure state for a cron service the way it
   would be for `backend`/`frontend`).
6. Re-register every configured integration's OAuth redirect URI with its
   provider (WHOOP, Hue, Google Cloud Console, Spotify, Alexa Developer
   Console) to point at the production backend URL instead of
   `localhost:3000`.

## 6. CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs typecheck,
lint, test, and build on every push/PR to `main` — it does not deploy.
Railway's own GitHub integration handles deploys (auto-deploy on push to
`main`, configurable per service in Settings → Source).
