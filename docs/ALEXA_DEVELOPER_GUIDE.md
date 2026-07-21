# Amazon Alexa — Developer Preparation Guide

Everything the backend and voice-command logic needs is built and
verified (see docs/MILESTONES.md's Alexa section for exactly what was
tested and how). This guide covers what's left — all of it requires your
own Amazon Developer account, since a real skill can only be created,
configured, and tested through Amazon's own console and services.

## 1. Amazon Developer account

1. Go to [developer.amazon.com](https://developer.amazon.com) and sign in
   with (or create) an Amazon account.
2. Registering as an Alexa developer is free — no paid tier is required
   to build, test privately, and even publish a free skill (unlike
   Apple's Developer Program, there's no annual fee here).
3. Note your **Vendor ID**: Alexa Developer Console → Settings (or
   `developer.amazon.com/settings/console/mycid`) — this is the
   `{vendorId}` in every account-linking redirect URI
   (`https://pitangui.amazon.com/api/skill/link/{vendorId}`, etc.). Set
   it as `ALEXA_VENDOR_ID` in your backend's environment.

## 2. Create the skill in the Alexa Developer Console

1. [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) → **Create Skill**.
2. Name: "MoodSync". Default language: English (US) (add more locales
   later if you want).
3. Choose **Other** → **Custom** as the skill type — confirmed during
   this integration's design (docs/ALEXA_ARCHITECTURE.md §1) as the
   right fit; do not choose "Smart Home."
4. Choose **Provision your own** for the backend (not one of Amazon's
   templates) — you already have a working backend
   (`backend/src/api/routes/integrations/alexa.ts`).

## 3. Upload the interaction model

1. In the console's **Build** tab → **JSON Editor**.
2. Paste the contents of
   `integrations/alexa/src/interactionModel.json` — this defines the
   invocation name ("mood sync") and all nine custom intents plus the
   required Amazon built-ins.

   **If you're updating an already-published/certified skill**: uploading
   a changed interaction model here re-triggers Amazon's certification
   review for the skill. Don't do this while a submission is actively
   pending a publish decision — wait for that decision first, then
   update and resubmit, so you don't restart the review clock in the
   middle of an existing one.
3. Click **Save Model**, then **Build Model** (this compiles the NLU
   model — takes a minute or two).

## 4. Configure the endpoint

1. **Build** tab → **Endpoint**.
2. Choose **HTTPS**.
3. Default Region URL: `https://<your-backend-domain>/api/alexa/skill`
   — must be a real, publicly reachable HTTPS URL. `localhost` will not
   work; Amazon's servers need to reach it directly.
4. SSL certificate type:
   - **Development/testing**: "My development endpoint is a sub-domain
     of a domain that has a wildcard certificate from a certificate
     authority" or "I will upload a self-signed certificate" — confirmed
     from Amazon's own docs that a self-signed cert is fine for testing
     but **not** for publishing.
   - **Before publishing**: switch to "My development endpoint has a
     certificate from a trusted certificate authority" — you'll need a
     real CA-signed cert (e.g. via Let's Encrypt) on your production
     domain.

## 5. Configure account linking

1. **Build** tab → **Tools** → **Account Linking**.
2. Toggle on, then fill in exactly what's in
   `integrations/alexa/src/skillManifest.template.json`'s
   `accountLinkingRequest` block:
   - Auth Code Grant (this is `type: AUTH_CODE`)
   - Authorization URI: `https://<your-frontend-domain>/integrations/alexa/authorize`
   - Access Token URI: `https://<your-backend-domain>/api/integrations/alexa/token`
   - Client ID: generate your own — `openssl rand -hex 32` — this is a
     value **you** invent and put in both the console and your backend's
     `ALEXA_SKILL_CLIENT_ID` env var; Amazon does not issue it to you.
   - Client Secret: same idea — `openssl rand -base64 32`, set as
     `ALEXA_SKILL_CLIENT_SECRET` on the backend.
   - Client Authentication Scheme: **HTTP Basic** (matches
     `accessTokenScheme: HTTP_BASIC`).
   - Scope: `profile`
   - Default Access Token Expiration: `3600` seconds (matches the
     backend's `ACCESS_TOKEN_TTL_SECONDS`).
3. Amazon will display the **Redirect URLs** for your skill on this same
   page (the three regional `pitangui`/`layla`/`alexa.amazon.co.jp` URLs)
   — these are informational (Amazon already knows them; your backend's
   `isValidAmazonRedirectUri` in `backend/src/services/alexaService.ts`
   already validates against this exact set), nothing to copy anywhere.

## 6. Required environment variables

Add to your backend's environment (`.env.local` for local dev, your real
secret manager for production — see `backend/src/config/env.ts`):

```
ALEXA_SKILL_CLIENT_ID=<the client ID you generated in step 5>
ALEXA_SKILL_CLIENT_SECRET=<the client secret you generated in step 5>
ALEXA_VENDOR_ID=<your Vendor ID from step 1.3>
ALEXA_TOKEN_SECRET=<openssl rand -base64 32 — a NEW secret, distinct from the client secret>
```

`ALEXA_TOKEN_SECRET` is not something Amazon needs to know — it's what
your own backend uses internally to sign the authorization-code and
access-token JWTs it issues. Never reuse `JWT_ACCESS_SECRET` or
`OAUTH_STATE_SECRET` for this (see `backend/src/config/env.ts`'s comment
on why these are kept as separate trust domains).

## 7. Privacy policy and skill metadata

1. **Build** tab → **Distribution** (or **Publishing** in newer console
   versions).
2. Fill in the fields from
   `integrations/alexa/src/skillManifest.template.json`'s
   `publishingInformation` block (name, summary, description, example
   phrases, keywords, category `HEALTH_AND_FITNESS`).
3. **Privacy & Compliance**: set `usesPersonalInfo: true`, and provide a
   real, live **Privacy Policy URL** — required for any skill that uses
   account linking, and specifically checked during certification (see
   §9).

## 8. Testing

**In the Alexa Developer Console simulator** (no physical device needed):
1. **Test** tab → enable testing ("Development" is enough, no need to
   publish first).
2. Type or speak: "ask mood sync how I'm doing today" — the simulator
   shows the exact JSON request sent to your endpoint and the JSON
   response received, invaluable for debugging before touching a real
   device.
3. Test account linking: in the simulator's **Alexa App** panel, or by
   installing the actual Alexa app and enabling your skill under "Your
   Skills" → "Dev" tab (only visible when signed in with the same Amazon
   account as your developer account) → "MoodSync" → "Enable" → "Link
   Account".

**On a real Echo device or the Alexa phone app:**
1. Sign into the Alexa app with the same Amazon account used for the
   Alexa Developer Console.
2. Skills & Games → Your Skills → Dev tab → MoodSync → Enable → Link
   Account → log in with your MoodSync credentials → Approve.
3. Say: "Alexa, ask MoodSync how I'm doing today."

**Local backend during testing**: your backend needs to be reachable
from the public internet for Amazon's servers to call it — use a tunnel
(e.g. `ngrok http 3000`) pointed at your local backend, and set the
Developer Console's endpoint URL and your account-linking
authorization/token URLs to the tunnel's HTTPS URL for the duration of
testing.

## 9. Certification requirements for publishing

Confirmed directly from Amazon's hosting/certification documentation
(see docs/ALEXA_ARCHITECTURE.md §10):

- **CA-signed SSL certificate required** — a self-signed cert (fine for
  development) will fail certification.
- **Signature verification is mandatory and checked** — already
  implemented (`integrations/alexa/src/verifyRequest.ts`), but Amazon's
  reviewers specifically test that unsigned/tampered/stale requests are
  rejected. Nothing further to do here, but don't disable or bypass this
  check for any reason before submitting.
- **Response latency**: Amazon expects a response within roughly 8
  seconds — make sure your production backend and database aren't
  significantly slower than your local/tunnel testing environment.
- **Account linking must actually work end-to-end** on a real device —
  reviewers will attempt to link an account as part of certification.
- **Privacy policy URL must be live and accurate** to what data the
  skill actually uses (health/fitness data, used only to drive the
  user's own automations — see docs/ALEXA_ARCHITECTURE.md §5's App
  Review-equivalent data-use note).
- **Testing instructions**: provide a real demo account (email/password)
  in the submission's testing instructions field — reviewers cannot sign
  up for a new MoodSync account themselves.
- Submit via **Distribution** tab → **Submit for Review**. Typical
  review turnaround is a few days; you'll get specific rejection reasons
  if anything fails, most commonly account-linking issues or an invalid
  certificate.

## Checklist — what you must do before this can be tested for real

- [ ] Create a free Amazon Developer account and note your Vendor ID.
- [ ] Create the custom skill in the Alexa Developer Console.
- [ ] Upload `integrations/alexa/src/interactionModel.json` and build the model.
- [ ] Point the skill's endpoint at your backend's real, publicly reachable `/api/alexa/skill` URL (a tunnel for local dev).
- [ ] Generate `ALEXA_SKILL_CLIENT_ID`/`ALEXA_SKILL_CLIENT_SECRET`/`ALEXA_TOKEN_SECRET` and configure account linking in the console to match.
- [ ] Set all four `ALEXA_*` environment variables on your backend.
- [ ] Fill in privacy policy URL and skill metadata.
- [ ] Test account linking + every voice command in the console simulator, then on a real Echo device or the Alexa app.
- [ ] Get a CA-signed SSL certificate on your production domain before submitting for certification.

## What's a genuine blocker vs. what's already done

| | Status |
|---|---|
| Backend OAuth-as-authorization-server flow (authorize, token exchange, refresh) | ✅ Done, verified end-to-end against the real running backend (`scripts/demoAlexaVoiceCommand.mjs`) |
| Request signature/timestamp verification logic | ✅ Done, logic-verified against a synthetic certificate chain (real Amazon-signed traffic can only be tested once a real skill exists — see integrations/alexa/src/verifyRequest.ts's doc comment) |
| All nine voice intent handlers (status, sleep, report, sync, lights on/off, 3 named routines, security) | ✅ Done, verified end-to-end including both the "no data yet" and "real data" cases |
| Dashboard Connections card | ✅ Done, verified in-browser |
| Creating the actual skill in the Alexa Developer Console | ❌ Requires an Amazon Developer account |
| Uploading/building the interaction model | ❌ Requires the Developer Console |
| A real, publicly reachable HTTPS endpoint (or a tunnel) | ❌ This sandbox has no public internet-facing HTTPS endpoint |
| Testing the real signed webhook against genuine Amazon traffic | ❌ Requires the above |
| CA-signed SSL certificate | ❌ Requires a real domain + certificate authority |
| Certification / publishing | ❌ Requires all of the above plus Amazon's review process |
