import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(`/api/music-sessions${search}`, { method: "GET" });
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/music-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
