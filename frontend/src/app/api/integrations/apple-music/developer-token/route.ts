import { proxyToBackend } from "@/lib/proxy";

/**
 * MusicKit JS needs this before it can do anything — see
 * appleMusicService.issueDeveloperToken's doc comment. Returns 503 with
 * a real error body when the server has no MusicKit key configured yet,
 * which the client wrapper surfaces as "Apple Music isn't set up on
 * this server yet" rather than a generic failure.
 */
export async function GET() {
  return proxyToBackend("/api/integrations/apple-music/developer-token");
}
