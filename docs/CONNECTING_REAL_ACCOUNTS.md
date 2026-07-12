# Connecting real WHOOP / Fitbit accounts locally

MoodSync's OAuth code for WHOOP and Fitbit (Google Health) is built and
verified — what's missing to test a real, live connection is a real
developer app registered on each platform, which only you can create
(it requires your own account and agreement to their terms). This is the
exact, minimal path to get both working locally.

## 1. WHOOP

1. Go to **developer.whoop.com** and sign in with a WHOOP account that
   has an active membership (required to access the developer platform).
2. Create a new app. You'll be asked for:
   - **Redirect URI** — use exactly: `http://localhost:3000/api/integrations/whoop/callback`
   - **Scopes** — request all of: `read:recovery`, `read:sleep`,
     `read:cycles`, `read:workout`, `read:profile`, `read:body_measurement`,
     `offline` (this app already requests exactly this set — see
     `integrations/whoop/src/oauth.ts`).
3. Copy the **Client ID** and **Client Secret** it gives you.
4. Add to `backend/.env.local` (or wherever your backend reads env from):
   ```
   WHOOP_CLIENT_ID="<paste>"
   WHOOP_CLIENT_SECRET="<paste>"
   WHOOP_REDIRECT_URI="http://localhost:3000/api/integrations/whoop/callback"
   ```
5. Restart the backend. Click "Connect WHOOP" on the dashboard — you
   should land on WHOOP's real consent screen instead of getting the
   "isn't configured" error banner.

## 2. Fitbit (via Google Health API)

The legacy Fitbit Web API sunsets September 2026 — this app targets its
real successor, the Google Health API, while keeping the "Fitbit" name
since that's the wearable brand users recognize (see
`docs/INTEGRATIONS_RESEARCH.md`).

1. Go to **console.cloud.google.com**, create (or pick) a project, and
   enable the **Google Health API**.
2. Configure an OAuth consent screen (External user type is fine for
   testing — Google allows up to 100 test users before requiring the
   verification/CASA process described in `docs/MILESTONES.md`'s
   Milestone 7b).
3. Create an **OAuth 2.0 Client ID** (Web application type) with:
   - **Authorized redirect URI** — exactly:
     `http://localhost:3000/api/integrations/google-health/callback`
4. Under the consent screen's scopes, add all four this app requests
   (see `integrations/fitbit/src/oauth.ts`):
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - `https://www.googleapis.com/auth/googlehealth.settings.readonly` (needed for device/battery info)
5. Add yourself (and anyone else testing) as a **test user** on the
   consent screen — required for Restricted scopes before verification.
6. Copy the **Client ID** and **Client Secret**.
7. Add to `backend/.env.local`:
   ```
   GOOGLE_HEALTH_CLIENT_ID="<paste>"
   GOOGLE_HEALTH_CLIENT_SECRET="<paste>"
   GOOGLE_HEALTH_REDIRECT_URI="http://localhost:3000/api/integrations/google-health/callback"
   ```
8. Restart the backend, click "Connect Fitbit" — same expectation as
   WHOOP above.

## What this doesn't unlock

Getting real credentials lets you complete the actual OAuth consent
screen and see live data — it doesn't change the compliance gates
already documented: Google Health beyond 100 test users still needs
verification + an annual CASA assessment (Milestone 7b), and neither
platform's terms are being reviewed here — read them yourself before
connecting a real account, same as any third-party integration.

## Philips Hue and Spotify

Same idea, same pattern — see `docs/INTEGRATIONS_RESEARCH.md` for their
registration URLs (developers.meethue.com,
developer.spotify.com/dashboard) and `.env.example` for the exact
redirect URIs each expects. Spotify in particular is capped at 5
authorized users in Development Mode (Milestone 8b) — fine for personal
testing, not for anything beyond that without Extended Quota Mode.
