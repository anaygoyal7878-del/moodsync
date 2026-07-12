import { proxyToBackend } from "@/lib/proxy";

/**
 * Proxies the consent page's "Approve" action to the backend's own OAuth
 * authorization-server endpoint — see docs/ALEXA_ARCHITECTURE.md §4.
 * Unlike every other integration's `/connect` route (which redirects the
 * browser to a THIRD PARTY's authorize URL), this one calls MoodSync's
 * own backend to mint an authorization code and returns the final Amazon
 * redirect target as JSON, since the browser needs to navigate to that
 * URL only after the user's approval click, not on page load.
 */
export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/integrations/alexa/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
