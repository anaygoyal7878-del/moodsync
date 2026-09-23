import { proxyToBackend } from "@/lib/proxy";

/** The iso-principle tempo plan for a session about to start. */
export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyToBackend(`/api/music-sessions/plan${query}`);
}
