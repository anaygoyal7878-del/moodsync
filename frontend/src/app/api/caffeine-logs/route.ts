import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/caffeine-logs", { method: "GET" });
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/caffeine-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
