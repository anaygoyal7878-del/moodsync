import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/messaging/settings", { method: "GET" });
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/messaging/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
