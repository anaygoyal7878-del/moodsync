import { BACKEND_API_URL } from "@/lib/env";
import { setSessionCookies } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json();

  const backendResponse = await fetch(`${BACKEND_API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await backendResponse.json();
  if (!backendResponse.ok) {
    return Response.json(data, { status: backendResponse.status });
  }

  await setSessionCookies({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return Response.json({ ok: true });
}
