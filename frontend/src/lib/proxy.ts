import { BACKEND_API_URL } from "./env";
import { getAccessToken } from "./session";

/** Route Handler bodies for actions (device control, rule CRUD, integration
 * connect/sync/disconnect) — same cookie-to-Bearer translation as the auth
 * routes, forwarding the backend's status/body through unchanged so client
 * components can use the same response-handling logic either way. */
export async function proxyToBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const response = await fetch(`${BACKEND_API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 204) return new Response(null, { status: 204 });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
