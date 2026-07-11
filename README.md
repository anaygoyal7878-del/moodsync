# MoodSync

MoodSync is the intelligence layer between a user's wearable health data and
their existing smart home ecosystem. It does not manufacture hardware —
it connects to wearables (Fitbit/Google Health, WHOOP, Garmin) and smart
home platforms (Philips Hue, Spotify — see `docs/INTEGRATIONS_RESEARCH.md`
for why Alexa and Ecobee are not in the v1 plan), and automatically
recommends or triggers environment changes based on biometric signals.

## Repository layout

This is an npm-workspaces monorepo:

```
frontend/          Next.js SaaS web app (marketing site + dashboard)
backend/            Fastify API server (auth, REST API, orchestration)
shared/             Types and utilities shared across every workspace
database/            Prisma schema, migrations, seed data — the single
                     source of truth for the data model
ai/                  The decision engine (biometric signals -> recommended
                     automations), framework-agnostic and independently testable
integrations/        One package per external platform (fitbit, garmin,
                     whoop, hue, spotify, ecobee) — typed OAuth + API clients,
                     nothing else
workers/             Background job processes (data sync, decision runs) —
                     deployed and scaled independently from the API server
tests/               Cross-cutting integration/e2e tests (unit tests live
                     next to the code they test, inside each package)
docs/                Architecture, research, and milestone documentation
scripts/             Dev/ops scripts
```

**Why `integrations/` and `workers/` are top-level packages, not folders
inside `backend/`:** both the API server and the background workers need
the same typed platform clients, and workers need to scale independently
from the request/response API (a Fitbit sync job shouldn't compete for
the same process as an inbound API request). Keeping them as separate
workspace packages makes that a deployment decision, not a refactor.

## Also in this repository

`Packages/` (a Swift package for a native iOS companion), `supabase/`
(Supabase Edge Functions), and `web/` (an earlier React prototype focused
specifically on scent/diffuser recommendations) predate this platform
rearchitecture and are kept as-is. This monorepo (`frontend/`, `backend/`,
`shared/`, `database/`, `ai/`, `integrations/`, `workers/`) is the current,
actively developed product direction described in `docs/MILESTONES.md`.

## Getting started

See `docs/MILESTONES.md` for the build plan and current status, and
`docs/INTEGRATIONS_RESEARCH.md` for the verified (not assumed) state of
every third-party API this product depends on.

```
npm install
npm run db:generate
npm run dev:backend
```

### Local database

The backend needs a real Postgres reachable at `DATABASE_URL` (see
`.env.example`) — `npm run dev:backend` will fail its env validation
without one. Two ways to get one locally:

- **Docker/Homebrew Postgres, if available**: point `DATABASE_URL` at it
  and run `npx prisma migrate dev` from `database/`.
- **No Docker/Homebrew available** (e.g. this sandboxed dev environment):
  use the `embedded-postgres` npm package, which downloads and runs a
  real Postgres binary as a subprocess — no system install required.
  ```js
  // scratch script, not part of the app — run once to init+start:
  import EmbeddedPostgres from "embedded-postgres";
  const pg = new EmbeddedPostgres({ databaseDir: "./pgdata", user: "moodsync", password: "moodsync", port: 5432 });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("moodsync_dev");
  ```
  Then `DATABASE_URL="postgresql://moodsync:moodsync@localhost:5432/moodsync_dev"`,
  same `prisma migrate dev` step. See `docs/MILESTONES.md`'s "Real
  end-to-end verification" entry for how this was used to verify the
  full signup/login/session/logout flow against a genuine database.
