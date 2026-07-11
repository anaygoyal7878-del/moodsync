import { BACKEND_API_URL } from "@/lib/env";
import { clearSessionCookies, getRefreshToken } from "@/lib/session";

export async function POST() {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    // Best-effort: even if the backend call fails, we still clear the
    // local session cookies below so the user is logged out client-side
    // regardless. The refresh token will simply expire on its own TTL if
    // the revoke call didn't land.
    await fetch(`${BACKEND_API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }

  await clearSessionCookies();
  return Response.json({ ok: true });
}
