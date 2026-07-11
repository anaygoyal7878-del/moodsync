import { BACKEND_API_URL } from "./env";
import { getAccessToken } from "./session";

export type BackendResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Server Component data fetching against the backend. Never throws — a
 * failed fetch (no session, backend down, 404) becomes a typed error the
 * caller renders inline, since one dashboard section failing shouldn't
 * take the whole page down with it. */
export async function backendFetch<T>(path: string, init?: RequestInit): Promise<BackendResult<T>> {
  const accessToken = await getAccessToken();
  if (!accessToken) return { ok: false, status: 401, error: "Not authenticated" };

  let response: Response;
  try {
    response = await fetch(`${BACKEND_API_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server" };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
    return { ok: false, status: response.status, error };
  }

  if (response.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await response.json()) as T };
}
