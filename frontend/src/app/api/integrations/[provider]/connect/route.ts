import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";

const CONNECTABLE_PROVIDERS = ["whoop", "hue", "google-health", "spotify"] as const;
type ConnectableProvider = (typeof CONNECTABLE_PROVIDERS)[number];

function isConnectable(value: string): value is ConnectableProvider {
  return (CONNECTABLE_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Starts an OAuth connect flow. The backend is a Bearer-token API, so it
 * can't issue the initial redirect itself (a top-level browser navigation
 * can't carry an Authorization header) — this route fetches the
 * authorization URL server-side using the session cookie, then hands the
 * browser a plain redirect to the provider.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isConnectable(provider)) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 404 });
  }

  const accessToken = await getAccessToken();
  if (!accessToken) return Response.redirect(new URL("/login", request.url));

  const returnTo = new URL("/dashboard", request.url).toString();
  const authorizeUrl = new URL(`${BACKEND_API_URL}/api/integrations/${provider}/authorize`);
  authorizeUrl.searchParams.set("returnTo", returnTo);

  const response = await fetch(authorizeUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return Response.redirect(new URL(`/dashboard?error=${provider}_unavailable`, request.url));
  }

  const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
  return Response.redirect(authorizationUrl);
}
