#!/usr/bin/env node
/**
 * Pushes a realistic, simulated batch of Apple Health readings through the
 * REAL backend ingest pipeline (login -> POST /api/integrations/apple-health/ingest)
 * for a real MoodSync account, exactly the way the iOS companion app would.
 *
 * Why this exists: Apple Health has no server-side API, so unlike WHOOP or
 * Google Health there's no way to "fake an OAuth connection" and let a
 * sync worker pull real-shaped data — the only client that can ever
 * produce Apple Health readings is a physical device running the iOS
 * companion app (see docs/APPLE_HEALTH_ARCHITECTURE.md). This script is
 * NOT a replacement for that — it can't test HealthKit itself, permission
 * dialogs, or on-device normalization. What it DOES let you verify without
 * an iPhone or Apple Developer account: the ingest endpoint's validation,
 * the WearableConnection/BiometricReading persistence, the dedupe
 * constraint, automation dispatch off Apple Health readings, and the
 * dashboard's Apple Health Connections card and biometric charts — the
 * entire server-side + frontend half of the integration.
 *
 * Usage:
 *   node scripts/demoAppleHealthSync.mjs <email> <password> [baseUrl]
 *
 * The account must already exist (sign up via the web app first). Data is
 * written for that real account in whatever database the backend is
 * pointed at — don't run this against a production backend with a real
 * user's credentials.
 */

const [, , email, password, baseUrlArg] = process.argv;
const baseUrl = baseUrlArg ?? 'http://localhost:3000';

if (!email || !password) {
  console.error('Usage: node scripts/demoAppleHealthSync.mjs <email> <password> [baseUrl]');
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

/** A full day of 5-minute heart-rate samples, mimicking what the iOS
 * companion app's background-delivery sync (docs/APPLE_HEALTH_ARCHITECTURE.md
 * §7) would produce over a day, oscillating in a plausible resting-to-light-
 * activity range with noise — not a flat line, so a trend chart looks real. */
function buildHeartRateSamples(now) {
  const samples = [];
  const samplesPerDay = 288; // every 5 minutes
  for (let i = 0; i < samplesPerDay; i++) {
    const timestamp = new Date(now.getTime() - i * 5 * 60_000);
    const hourOfDay = timestamp.getHours() + timestamp.getMinutes() / 60;
    // Lower overnight, higher through waking hours, small random noise.
    const baseline = hourOfDay < 7 || hourOfDay > 23 ? 56 : 68;
    const activityBump = Math.sin((hourOfDay / 24) * Math.PI * 2) * 8;
    const noise = (Math.random() - 0.5) * 6;
    const heartRate = Math.round(Math.max(45, baseline + activityBump + noise));
    samples.push({ timestamp: timestamp.toISOString(), heartRate });
  }
  return samples;
}

function buildDailySummaryReading(now) {
  // Offset 1 second off the most recent heart-rate sample's timestamp
  // (which uses `now` exactly) so the two rows don't collide against the
  // (userId, provider, timestamp) unique constraint — a real collision
  // there would silently keep whichever row inserted first and drop the
  // other, which is correct production behavior but not what a demo
  // script wants (it would drop this reading's HRV/resting-HR/sleep data).
  const timestamp = new Date(now.getTime() + 1000);
  return {
    timestamp: timestamp.toISOString(),
    restingHeartRate: 54,
    heartRateVariability: 46.8,
    respiratoryRate: 14.2,
    bloodOxygen: 97.5,
    sleepScore: 88,
    steps: 6280,
    calories: 412,
    activityLevel: Math.min(100, (6280 / 10_000) * 100),
  };
}

async function ingest(accessToken) {
  const now = new Date();
  const readings = [...buildHeartRateSamples(now), buildDailySummaryReading(now)];

  const res = await fetch(`${baseUrl}/api/integrations/apple-health/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ readings, deviceName: 'Apple Watch (Demo)' }),
  });
  if (!res.ok) {
    throw new Error(`Ingest failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

try {
  console.log(`Logging in as ${email} against ${baseUrl}...`);
  const accessToken = await login();
  console.log('Pushing simulated Apple Health readings (1 day of heart-rate samples + daily summary)...');
  const result = await ingest(accessToken);
  console.log(`Done. Backend reports ${result.readingsInserted} reading(s) inserted.`);
  console.log('Check the dashboard\'s Connections card and biometric trend chart for "Apple Health".');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
