# Philips Hue — Developer Setup Guide

Everything the backend and frontend need is already built and verified —
OAuth 2.0 client (PKCE), device sync, per-light on/off/brightness
control, and the Connections/Devices dashboard UI. **No Hue account has
ever been connected** — `HUE_CLIENT_ID`/`HUE_CLIENT_SECRET` have never
been set anywhere in this project. This guide covers getting real ones.

## What's independently confirmed vs. what you'll see live

The OAuth endpoints this integration calls
(`https://api.meethue.com/v2/oauth2/authorize` and `.../v2/oauth2/token`
— see `integrations/hue/src/oauth.ts`) are confirmed current directly
from Philips' own developer site: their docs explicitly state the older
v1 `/oauth2` path was deprecated in July 2020 in favor of `/v2/oauth2`,
matching what's coded here.

What I could **not** verify without logging in myself (Philips gates the
actual Remote API registration docs behind a developer account, and
account creation needs to be you, not me): the exact fields on the "new
app" form, and whether Philips requires manual approval before a new
app's credentials work. One indexed snippet from their own site said
"after registration your app has to be approved and then the
credentials are working" — treat that as a real possibility, not
guaranteed instant like Google/Spotify. If your app sits in a pending
state after registering, that's expected; there's nothing to debug on
MoodSync's side while you wait.

## 1. Create a Hue Developer account

1. Go to [developers.meethue.com/register](https://developers.meethue.com/register/) and sign up (a Hue/Signify account — separate from a regular Hue app account if you have one).
2. Log in at [developers.meethue.com/login](https://developers.meethue.com/login/).

## 2. Register a Remote API app

1. Go to [developers.meethue.com/my-apps](https://developers.meethue.com/my-apps/) → create/add a new app.
2. You'll be asked for an app name and a **redirect URI** — use your backend's real callback URL:
   ```
   https://backend-production-046a8.up.railway.app/api/integrations/hue/callback
   ```
   (This must match `HUE_REDIRECT_URI` exactly, character for character — `hueService.ts`'s callback handler doesn't validate the redirect URI itself since Hue's own OAuth server enforces the match.)
3. Fill in whatever else the form asks (description, etc.) — I can't tell you the exact fields since that page requires login, so just fill in what's presented honestly (MoodSync — an app connecting smart lights to biometric wellness automations).
4. Submit. If it's pending Signify approval, wait for that before continuing — the Client ID/Secret may not work yet even if displayed.
5. Once approved (or immediately, if no approval step applies to your app), note the **Client ID** and **Client Secret** — these are Philips-issued, unlike Alexa's self-invented credentials.

## 3. Set environment variables

On Railway → `backend` service → Variables (directly on the service, not Project-level Shared Variables — see `docs/DEPLOYMENT.md`):

```
HUE_CLIENT_ID=<Client ID from the my-apps page>
HUE_CLIENT_SECRET=<Client Secret from the my-apps page>
HUE_REDIRECT_URI=https://backend-production-046a8.up.railway.app/api/integrations/hue/callback
```

## 4. Verify it's live

1. Redeploy the `backend` service after setting the env vars.
2. Log into MoodSync → **Connections** → Philips Hue card should show a "Connect Hue" button (if it instead shows nothing broken but also nothing configured, check the three env vars landed on the right service).
3. Click Connect → you should land on Philips' real sign-in/consent page, not an error.
4. Approve → redirected back to MoodSync, Hue card should show "Active."
5. Go to **Devices** → sync should list your real Hue lights (via `hueService.syncDevices`, `HueClient.listLights`).
6. Try On/Off and the brightness slider on a real light from `DeviceCard.tsx` — confirm it actually changes.

## What's a genuine blocker vs. what's already done

| | Status |
|---|---|
| OAuth 2.0 client (PKCE, token refresh) | ✅ Done, endpoint paths independently confirmed against Philips' own docs |
| Device sync (`syncDevices`, `ConnectedDevice` rows) | ✅ Done |
| Light control (on/off/brightness/color temp) | ✅ Done, verified with real API-shape tests (`integrations/hue/src/client.test.ts`) |
| Connections/Devices dashboard UI | ✅ Done, verified in-browser |
| `HueNotConfiguredError` handling on all routes (authorize/sync/state) | ✅ Done (fixed sync-devices and device-state routes returning a raw 500 instead of a clean 503) |
| Hue Developer account | ❌ Requires your own signup |
| Remote API app registration + possible approval wait | ❌ Requires the above |
| Setting the three env vars | ❌ Requires the above |
| Testing against a real bridge/lights | ❌ Requires all of the above, plus an actual Hue Bridge on your network linked to your Hue account |
