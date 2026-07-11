/**
 * Server-only config. `BACKEND_API_URL` is never exposed to the client —
 * the browser only ever talks to this Next.js app's own `/api/auth/*`
 * route handlers, which proxy to the real backend and translate its JWTs
 * into httpOnly cookies. See lib/session.ts for why.
 */
export const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:3000";
