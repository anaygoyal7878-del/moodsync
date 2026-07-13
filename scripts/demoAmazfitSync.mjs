#!/usr/bin/env node
/**
 * Pushes a realistic, simulated batch of Amazfit readings through the REAL
 * backend ingest pipeline (login -> POST /api/integrations/amazfit/ingest)
 * for a real MoodSync account, exactly the way the Zepp OS Mini Program's
 * Side Service would (see zepp/MoodSyncCompanion/app-side/index.js).
 *
 * Why this exists: Amazfit has no server-side API a third party can pull
 * from (see docs/AMAZFIT_ARCHITECTURE.md) — the only client that can ever
 * produce Amazfit readings is a real watch running the Mini Program, which
 * this sandbox can't run (no Zepp Simulator, no physical device). This
 * script is NOT a replacement for that — it can't test the on-watch sensor
 * reads, the Messaging API relay, or the Side Service's fetch() call. What
 * it DOES let you verify without a watch: the ingest endpoint's
 * validation, the WearableConnection/BiometricReading persistence, the
 * dedupe constraint, automation dispatch off Amazfit readings, and the
 * dashboard's Amazfit Connections card and biometric charts — the entire
 * server-side + frontend half of the integration.
 *
 * Usage:
 *   node scripts/demoAmazfitSync.mjs <email> <password> [baseUrl]
 *
 * The account must already exist (sign up via the web app first). Data is
 * written for that real account in whatever database the backend is
 * pointed at — don't run this against a production backend with a real
 * user's credentials.
 */

const [, , email, password, baseUrlArg] = process.argv;
const baseUrl = baseUrlArg ?? 'http://localhost:3000';

if (!email || !password) {
  console.error('Usage: node scripts/demoAmazfitSync.mjs <email> <password> [baseUrl]');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.accessToken;
}

/** A single sensor snapshot, mimicking what page/index.js's "Sync" button
 * sends in one Mini Program session — Zepp OS's sensor APIs expose
 * current/recent values, not a historical log to replay, so unlike Apple
 * Health's day of 5-minute samples this is realistically just one reading
 * per sync (see docs/AMAZFIT_ARCHITECTURE.md §4). */
function buildSnapshot(now) {
  return {
    timestamp: now.toISOString(),
    heartRate: Math.round(58 + Math.random() * 20),
    sleepScore: Math.round(75 + Math.random() * 15),
    steps: Math.round(3000 + Math.random() * 6000),
  };
}

async function ingest(accessToken) {
  const readings = [buildSnapshot(new Date())];

  const res = await fetch(`${baseUrl}/api/integrations/amazfit/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) {
    throw new Error(`Ingest failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

try {
  console.log(`Logging in as ${email} against ${baseUrl}...`);
  const accessToken = await login();
  console.log('Pushing a simulated Amazfit sensor snapshot (heart rate, sleep score, steps)...');
  const result = await ingest(accessToken);
  console.log(`Done. Backend reports ${result.readingsInserted} reading(s) inserted.`);
  console.log('Check the dashboard\'s Connections card and biometric trend chart for "Amazfit".');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
