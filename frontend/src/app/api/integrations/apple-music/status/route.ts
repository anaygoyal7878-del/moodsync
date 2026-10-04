import { proxyToBackend } from "@/lib/proxy";

/** Whether MoodSync's server holds an active Apple Music connection —
 * the client compares this against MusicKit's own browser-side
 * authorization so a disconnect made elsewhere actually sticks. */
export async function GET() {
  return proxyToBackend("/api/integrations/apple-music");
}
