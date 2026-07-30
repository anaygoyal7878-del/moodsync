import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyToBackend(`/api/music-sessions/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
}
