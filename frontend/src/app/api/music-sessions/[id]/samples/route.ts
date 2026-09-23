import { proxyToBackend } from "@/lib/proxy";

/** Session biometric samples — read for the evolution chart, write
 * while a session plays. The client samples rather than the server
 * polling: only the device knows when audio is actually playing, and a
 * server-side poller would keep sampling through a pause. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/music-sessions/${id}/samples`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/music-sessions/${id}/samples`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
