import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/meditation-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
