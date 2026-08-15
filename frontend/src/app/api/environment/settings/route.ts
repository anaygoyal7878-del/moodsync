import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/environment/settings", { method: "GET" });
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/environment/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
