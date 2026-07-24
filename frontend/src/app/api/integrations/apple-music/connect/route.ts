import { proxyToBackend } from "@/lib/proxy";

/**
 * Called right after MusicKit JS's client-side `music.authorize()`
 * resolves with a Music User Token — this is the only path that token
 * ever reaches MoodSync's backend, since Apple Music (unlike every OAuth
 * provider here) has no server-side authorize/callback redirect at all.
 */
export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/integrations/apple-music/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
