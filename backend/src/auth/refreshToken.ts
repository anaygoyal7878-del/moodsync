import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDurationMs(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) throw new Error(`Invalid duration format: "${duration}" (expected e.g. "15m", "30d")`);
  const [, amount, unit] = match;
  const unitMs = UNIT_MS[unit ?? ''];
  if (amount === undefined || unitMs === undefined) {
    throw new Error(`Invalid duration format: "${duration}" (expected e.g. "15m", "30d")`);
  }
  return Number(amount) * unitMs;
}

export function generateRefreshToken(): { token: string; expiresAt: Date } {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_TOKEN_TTL));
  return { token, expiresAt };
}
