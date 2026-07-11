import { cookies } from "next/headers";

/**
 * Tokens live in httpOnly cookies, set by this app's own Route Handlers
 * (never returned to client-side JS) — safer against XSS than storing a
 * JWT in localStorage, which is the more common but weaker pattern for a
 * Bearer-token backend. The tradeoff: every server-rendered page or route
 * handler that needs the user's identity reads these cookies itself
 * (see requireSession below) rather than the browser attaching an
 * Authorization header automatically.
 */
const ACCESS_TOKEN_COOKIE = "moodsync_access_token";
const REFRESH_TOKEN_COOKIE = "moodsync_refresh_token";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Access token TTL matches the backend's own (see backend/.env.example,
 * JWT_ACCESS_TOKEN_TTL="15m") — kept here as a cookie Max-Age hint only;
 * the backend is the actual source of truth for expiry. */
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function setSessionCookies(tokens: TokenPair): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}
