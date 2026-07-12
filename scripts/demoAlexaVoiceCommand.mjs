#!/usr/bin/env node
/**
 * Exercises the REAL Alexa integration backend end-to-end: account
 * linking (the MoodSync-as-OAuth-authorization-server flow — see
 * docs/ALEXA_ARCHITECTURE.md §4) and every voice intent, for a real
 * MoodSync account, against the real running backend.
 *
 * What this CAN verify: the authorization-code mint, the token exchange
 * (both grant_type=authorization_code and refresh_token), and every
 * intent handler's actual logic (biometric lookups, sync dispatch,
 * named-rule execution) — all through the real service layer.
 *
 * What this CANNOT verify: the real Amazon-signed webhook
 * (`POST /api/alexa/skill`) itself, since there is no way to obtain a
 * genuine SignatureCertChainUrl/Signature-256 pair without an active,
 * certified skill receiving real traffic from Amazon. This script
 * instead calls `/api/integrations/alexa/demo-intent`, a dev-only route
 * (disabled in production) that runs the exact same
 * `alexaService.handleIntentRequest` the real webhook calls, just
 * authenticated with a normal MoodSync session JWT instead of an Alexa
 * signature — see backend/src/api/routes/integrations/alexa.ts.
 *
 * Usage:
 *   node scripts/demoAlexaVoiceCommand.mjs <email> <password> [baseUrl]
 *
 * The account must already exist (sign up via the web app first).
 */

const [, , email, password, baseUrlArg] = process.argv;
const baseUrl = baseUrlArg ?? 'http://localhost:3000';

if (!email || !password) {
  console.error('Usage: node scripts/demoAlexaVoiceCommand.mjs <email> <password> [baseUrl]');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  return (await res.json()).accessToken;
}

// Values a real Alexa Developer Console skill config would use — see
// integrations/alexa/src/skillManifest.template.json. Reads the same
// ALEXA_SKILL_CLIENT_ID/SECRET/VENDOR_ID this script's target backend was
// started with, so this only works against a backend you control the env
// for (exactly the dev/test posture this script is for).
const clientId = process.env.ALEXA_SKILL_CLIENT_ID;
const clientSecret = process.env.ALEXA_SKILL_CLIENT_SECRET;
const vendorId = process.env.ALEXA_VENDOR_ID;
if (!clientId || !clientSecret || !vendorId) {
  console.error('Set ALEXA_SKILL_CLIENT_ID, ALEXA_SKILL_CLIENT_SECRET, and ALEXA_VENDOR_ID in this shell (same values as backend/.env.local) before running.');
  process.exit(1);
}
const redirectUri = `https://pitangui.amazon.com/api/skill/link/${vendorId}`;

async function completeAuthorization(sessionAccessToken) {
  const res = await fetch(`${baseUrl}/api/integrations/alexa/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionAccessToken}` },
    body: JSON.stringify({ clientId, redirectUri, scope: 'profile', amazonState: 'demo-state-value' }),
  });
  if (!res.ok) throw new Error(`Authorize failed: ${res.status} ${await res.text()}`);
  const { redirectUrl } = await res.json();
  const code = new URL(redirectUrl).searchParams.get('code');
  if (!code) throw new Error('No code in redirect URL — authorize step did not behave as expected');
  return code;
}

async function exchangeCode(code) {
  const res = await fetch(`${baseUrl}/api/integrations/alexa/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${baseUrl}/api/integrations/alexa/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function tryIntent(sessionAccessToken, intentName) {
  const res = await fetch(`${baseUrl}/api/integrations/alexa/demo-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionAccessToken}` },
    body: JSON.stringify({ intentName }),
  });
  if (!res.ok) throw new Error(`${intentName} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.response?.outputSpeech?.text ?? '(no speech)';
}

try {
  console.log(`Logging in as ${email} against ${baseUrl}...`);
  const sessionAccessToken = await login();

  console.log('Completing account linking (MoodSync-as-authorization-server flow)...');
  const code = await completeAuthorization(sessionAccessToken);
  const tokens = await exchangeCode(code);
  console.log(`Linked. Access token expires in ${tokens.expires_in}s.`);

  console.log('Refreshing the access token (grant_type=refresh_token)...');
  const refreshed = await refreshAccessToken(tokens.refresh_token);
  console.log(`Refreshed. New access token expires in ${refreshed.expires_in}s.`);

  const intents = [
    'GetStatusIntent',
    'GetSleepSummaryIntent',
    'SyncDevicesIntent',
    'StartRelaxationIntent',
    'ImproveFocusIntent',
    'ActivateEveningRoutineIntent',
    'AMAZON.HelpIntent',
  ];
  console.log('\nExercising every voice intent:');
  for (const intentName of intents) {
    const speech = await tryIntent(sessionAccessToken, intentName);
    console.log(`  ${intentName}: "${speech}"`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
