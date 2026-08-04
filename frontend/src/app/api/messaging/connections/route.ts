import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/messaging/connections", { method: "GET" });
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/messaging/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
