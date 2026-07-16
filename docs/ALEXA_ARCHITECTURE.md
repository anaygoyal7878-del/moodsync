# Amazon Alexa Integration — Architecture

Every claim about Amazon's platform behavior below was verified against
live `developer.amazon.com` documentation during this design pass — see
the inline citations. Anything not independently confirmable is labeled
"uncertain" rather than asserted.

## 1. Which Alexa capability fits MoodSync — the decision

Amazon offers several distinct "skill" types. Two were seriously
considered:

| | **Smart Home Skill** | **Custom Skill (chosen)** |
|---|---|---|
| Invocation | Direct commands: *"Alexa, turn on the kitchen light"* — no skill name spoken | *"Alexa, ask MoodSync to..."* — skill name required |
| Model | Fixed discovery/directive protocol (`Alexa.PowerController`, `Alexa.BrightnessController`, etc.) against **physical/virtual devices** | Free-form interaction model: intents, slots, sample utterances, conversational responses |
| Fits | Turning things on/off, setting values on a discovered "device" | Answering questions, triggering named actions, multi-turn conversation |

Confirmed directly from Amazon's docs: Smart Home Skills are explicitly
**"not suitable"** for conversational queries like "how am I doing today"
or a spoken sleep summary — they're a device discovery/control protocol,
not a Q&A system. Every example command MoodSync needs to support
("ask MoodSync how I'm doing," "ask MoodSync for my sleep summary," "ask
MoodSync to start a relaxation session") follows the exact
`"Alexa, ask {invocation name} to {utterance}"` pattern that is the
defining shape of a **Custom Skill**. Decision: **Custom Skill**, hosted
as a self-hosted HTTPS web service (MoodSync's existing Fastify backend),
not AWS Lambda — consistent with every other integration in this
project running through the same backend rather than spinning up
provider-specific infrastructure.

## 2. The key structural difference from every other MoodSync integration

Every other integration (WHOOP, Google Health, Hue, Spotify) has MoodSync
acting as an **OAuth client**: MoodSync redirects the user to the
provider's authorization server, receives a code, and exchanges it for
*the provider's* access token, which MoodSync then uses to call *their*
API.

Alexa account linking inverts this. Amazon's Alexa app is the one
redirecting the user's browser to **MoodSync's own authorization
endpoint** — confirmed via Amazon's account-linking documentation: a
custom skill's account linking config points `authorizationUrl` and
`accessTokenUrl` at *your own* OAuth 2.0 authorization server. **MoodSync
must implement a small, real OAuth 2.0 authorization server** (issuing
codes, then access/refresh tokens against Amazon's registered client
credentials) — not just another OAuth client integration. This is the
single biggest architectural departure from the rest of the codebase,
and is called out explicitly here so it isn't mistaken for a copy-paste
of the WHOOP/Hue pattern.

## 3. Voice command flow (end to end)

```
User: "Alexa, ask MoodSync how I'm doing today."
        │
        ▼
Echo device → Alexa Voice Service (speech-to-text, NLU) → matches
   the utterance to MoodSync's interaction model → GetStatusIntent
        │
        ▼
Alexa service sends a signed HTTPS POST to MoodSync's skill endpoint:
   POST /api/alexa/skill
   Headers: SignatureCertChainUrl, Signature
   Body: IntentRequest envelope, including
         context.System.user.accessToken (MoodSync-issued JWT,
         present only if the user has linked their account)
        │
        ▼
MoodSync backend:
  1. Verifies the request is genuinely from Amazon (§6 Security Model)
  2. Verifies context.System.user.accessToken as a MoodSync-issued JWT
     → resolves to a MoodSync userId
  3. Routes IntentRequest.intent.name → the matching intent handler
  4. Handler reads/acts using EXISTING MoodSync services — the same
     biometricReadingRepository, automationRuleRepository, and action
     executors (executeHueAction/executeSpotifyAction) every other
     part of the product already uses. No parallel data path.
  5. Builds an Alexa response envelope: { outputSpeech, shouldEndSession }
        │
        ▼
Alexa service speaks the outputSpeech.text back to the user through
   the Echo device.
```

Latency budget: Alexa expects a response within roughly 8 seconds — this
matters for §5's error-handling design (never block on a slow downstream
call like Spotify's API without a timeout).

## 4. Authentication / account linking flow

```
1. User, in the Alexa app: "Enable MoodSync skill" → "Link account"
2. Alexa app opens (in an in-app browser) MoodSync's authorizationUrl:
     GET https://app.moodsync.com/integrations/alexa/authorize
         ?client_id=<registered in Alexa Developer Console>
         &response_type=code
         &redirect_uri=https://pitangui.amazon.com/api/skill/link/<vendorId>
         &state=<Amazon's own opaque CSRF token — echoed back unchanged>
         &scope=profile
3. This hits a FRONTEND page (not the backend directly) — necessary
   because MoodSync's session lives in the frontend's own httpOnly
   cookie (per the existing "never expose backend origin/JWTs to the
   browser" rule — see docs/ARCHITECTURE notes elsewhere in this repo).
   If not logged in, redirects to /login?returnTo=<this URL, with all
   Amazon query params preserved>.
4. Once logged in, the page shows: "Allow Alexa to access your MoodSync
   account?" — Approve / Deny.
5. On Approve, the frontend calls (with the user's own session JWT):
     POST /api/integrations/alexa/authorize
     { client_id, redirect_uri, scope }
   Backend validates client_id/redirect_uri against the registered
   skill config, mints a short-lived signed JWT "authorization code"
   (mirrors backend/src/lib/oauthState.ts's existing pattern — the code
   IS the pending-authorization record, no new DB table), and returns
   the final redirect target.
6. Frontend navigates the browser to:
     https://pitangui.amazon.com/api/skill/link/<vendorId>?code=<code>&state=<Amazon's state>
7. Amazon's servers call MoodSync's token endpoint server-to-server:
     POST https://api.moodsync.com/api/integrations/alexa/token
     Authorization: Basic base64(client_id:client_secret)   [accessTokenScheme: HTTP_BASIC]
     grant_type=authorization_code&code=<code>&redirect_uri=...
8. Backend verifies the code (JWT signature + expiry), verifies the
   client_id/client_secret match ALEXA_SKILL_CLIENT_ID/SECRET, and
   issues:
     - access_token: a short-lived MoodSync-issued JWT (aud: "alexa-skill",
       sub: userId) — verified statelessly on every voice request, no DB
       round trip needed for the hot path.
     - refresh_token: an opaque random token, stored (encrypted, reusing
       the existing OAuthToken table/oauthTokenRepository — the same
       table every other provider's credentials live in, just storing
       MoodSync-issued tokens instead of a third party's) so it's
       revocable via the dashboard's disconnect action.
9. Amazon stores both tokens and attaches accessToken to
   context.System.user.accessToken on every subsequent voice request
   for this user, refreshing it via grant_type=refresh_token against
   the same /token endpoint as needed.
```

## 5. Backend services and API routes

| Route | Method | Caller | Auth |
|---|---|---|---|
| `/api/integrations/alexa/authorize` | POST | MoodSync frontend (after user consent) | MoodSync session JWT |
| `/api/integrations/alexa/token` | POST | Amazon's servers | HTTP Basic (skill client_id/secret) |
| `/api/alexa/skill` | POST | Amazon's servers (the actual voice webhook) | Alexa request signature (§6) |
| `/api/integrations/alexa/demo-intent` | POST | Dev/testing only — never real Alexa traffic | MoodSync session JWT |
| `/api/integrations/[provider]/disconnect` (existing route, `alexa` added as a valid provider) | POST | MoodSync dashboard | MoodSync session JWT |

`integrations/alexa` (new workspace package, mirrors every other
integration's `integrations/{whoop,hue,fitbit,spotify}` layout):
- `verifyRequest.ts` — Amazon request signature + timestamp verification
- `types.ts` — hand-typed request/response envelopes (LaunchRequest,
  IntentRequest, SessionEndedRequest, ResponseEnvelope) from the
  confirmed JSON schemas — no dependency on Amazon's `ask-sdk-core`,
  matching this project's existing pattern of hand-rolled REST clients
  rather than vendor SDKs
- `authCode.ts` — sign/verify the short-lived authorization-code JWT
- `skillToken.ts` — sign/verify the Alexa-issued access token, generate
  the opaque refresh token
- `interactionModel.json` — the full voice model for the Alexa Developer
  Console
- `skillManifest.template.json` — the skill manifest template

`backend/src/services/alexaService.ts` — orchestration: mints
authorization codes, exchanges codes/refresh tokens, dispatches intents
to handlers that call existing repositories/executors.

## 6. Security model

- **Signature verification** (confirmed algorithm, `/api/alexa/skill`
  only): validate `SignatureCertChainUrl` header — must be `https`,
  host `s3.amazonaws.com`, path starting `/echo.api/`, port 443 or
  absent; download and validate the certificate chain (validity dates,
  `echo-api.amazon.com` present in the signing cert's SAN list, chain
  trusts back to a root CA); verify the `Signature` header (RSA-SHA256)
  against the raw request body using the certificate's public key.
  Implemented with Node's built-in `crypto`/`X509Certificate` — not a
  third-party "alexa-verifier" package, since this is a security-critical
  path and the algorithm is fully specified by Amazon's own docs (see
  `integrations/alexa/src/verifyRequest.ts`).
- **Timestamp/replay protection**: reject any request whose
  `request.timestamp` is more than 150 seconds from server time —
  Amazon's own documented threshold, explicitly required for
  certification ("web services that accept unsigned or out-of-date
  requests will not pass certification").
- **Token authentication** (`/api/alexa/skill`, voice requests):
  `context.System.user.accessToken` verified as a MoodSync-issued JWT;
  absent token → respond asking the user to link their account, never
  a raw 401 (Alexa skills must always return a valid response envelope).
- **Token endpoint authentication** (`/api/integrations/alexa/token`):
  HTTP Basic client credentials checked against `ALEXA_SKILL_CLIENT_ID`/
  `ALEXA_SKILL_CLIENT_SECRET` — a constant-time comparison, not `===`,
  to avoid a timing side-channel on the secret.
- **Authorization endpoint**: `redirect_uri` validated against the
  three documented Amazon regional patterns
  (`https://pitangui.amazon.com/api/skill/link/{vendorId}`,
  `https://layla.amazon.com/api/skill/link/{vendorId}`,
  `https://alexa.amazon.co.jp/api/skill/link/{vendorId}`) with
  `{vendorId}` pinned to the configured `ALEXA_VENDOR_ID` — never an
  open redirect.
- **Least privilege**: the only OAuth scope requested is `profile`
  (mapping Amazon's request to a MoodSync user) — no write access to
  anything Alexa-side; MoodSync never asks for Amazon account details
  beyond what's needed to identify which MoodSync user is speaking.

## 7. Error handling

- **Signature/timestamp failure**: HTTP 400, no response body leaking
  internals — these should only ever come from something other than
  real Alexa traffic once certified.
- **Unlinked account** (`context.System.user.accessToken` absent):
  respond with a `LinkAccount` card
  (`response.card.type: "LinkAccount"`) — Alexa's documented mechanism
  for prompting account linking directly in the Alexa app, rather than
  a spoken error.
- **Expired/invalid access token**: same `LinkAccount` response — from
  the skill's perspective this is indistinguishable from never having
  linked, by design (Alexa handles token refresh itself; a token MoodSync
  fully rejects means Alexa's stored token is stale beyond repair, e.g.
  after a user disconnected from the dashboard).
- **Downstream failures** (e.g. `StartRelaxationIntent` tries to call
  Hue and Hue's API is down): caught per-action (mirrors
  `ai/src/dispatch.ts`'s existing try/catch-per-rule pattern), spoken
  back as a specific, honest failure ("I couldn't reach your lights,
  but I've started your Spotify playlist") rather than a generic error—
  matching the existing dispatch engine's per-action outcome tracking.
- **No matching rule for a named voice action** (`StartRelaxationIntent`
  when the user has no rule with "relax" in its name — see §9): the
  skill says so and points the user to the dashboard, rather than
  guessing at a hardcoded default behavior.
- **Unhandled intent**: `AMAZON.FallbackIntent` and a catch-all default
  handler both return a helpful "I didn't catch that — try asking how
  you're doing, or to start a relaxation session" response,
  `shouldEndSession: false` so the user can retry in the same turn.

## 8. Scalability considerations

- **Stateless access-token verification**: the hot path
  (`/api/alexa/skill`) never needs a DB round trip to authenticate a
  request — the JWT itself carries the userId, verified in-process.
  Only the intent *handlers* touch the database, and only for the
  specific data/actions that intent needs (same cost profile as any
  other authenticated API call in this backend).
- **No polling, no worker**: unlike the wearable sync workers, this
  integration is entirely request-driven — Alexa calls MoodSync only
  when a user actually speaks a command. Nothing to schedule.
- **Idempotency**: intents like `SyncDevicesIntent` call the exact same
  underlying sync functions the dashboard's "Sync now" button already
  calls — already safe to invoke repeatedly (per-provider `bulkInsert`
  with `skipDuplicates`, see the Fitbit near-live work).
- **Rate limits**: Amazon doesn't impose a documented custom-skill
  request-rate limit tied to MoodSync's endpoint beyond normal voice
  usage patterns (one request per spoken command) — no special
  throttling needed beyond whatever the backend already has.

## 9. Voice command → implementation mapping

| Utterance | Intent | Implementation |
|---|---|---|
| "how I'm doing today" | `GetStatusIntent` | `biometricReadingRepository.findLatestNormalized` — same data the dashboard shows |
| "my sleep summary" | `GetSleepSummaryIntent` | Latest reading's `sleepScore`, falls back to "no recent sleep data" if unset |
| "sync my devices" | `SyncDevicesIntent` | Calls the same sync-now service functions as the dashboard's `SyncButton`, for every connected provider |
| "start a relaxation session" | `StartRelaxationIntent` | Finds the user's enabled `AutomationRule` whose name contains "relax" (case-insensitive); executes its actions directly via `executeHueAction`/`executeSpotifyAction` (bypassing condition/cooldown checks — this is an explicit command, not a biometric trigger) |
| "improve my focus" | `ImproveFocusIntent` | Same pattern, matching rule name contains "focus" |
| "activate my evening routine" | `ActivateEveningRoutineIntent` | Same pattern, matching rule name contains "evening" |
| "is my house secure" | `CheckSecurityIntent` | Fixed, honest response — no lock/security integration exists, and Alexa has no cross-skill API to query one even if it did (see docs/DECISION_ENGINE_ROADMAP.md) |

The relaxation/focus/evening-routine intents deliberately do **not**
hardcode a fixed scene — MoodSync has no built-in concept of "what
relaxation looks like" today, and inventing one would mean guessing at
undocumented product behavior. Reusing the user's own configured
automation rules means voice control is a natural extension of what
they've already built in the dashboard, and gracefully explains itself
when no matching rule exists yet.

## 10. Platform limitations found during research

- Smart Home Skills are architecturally unsuitable for this product's
  conversational commands (§1) — ruling out the other obvious Alexa
  capability.
- HTTPS web service hosting requires a CA-signed certificate (matching a
  domain in the cert's SAN) for a **published** skill — a self-signed
  cert only works for development/testing, confirmed directly from
  Amazon's hosting requirements.
- Signature verification is mandatory and specifically checked during
  Amazon's certification review — there is no way to publish a skill
  that skips it.
- Amazon expects a skill response within a short latency window
  (documented at roughly 8 seconds) — this bounds how much work an
  intent handler can safely do synchronously before Alexa times out and
  speaks its own generic error instead of MoodSync's.
