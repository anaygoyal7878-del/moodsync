import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/preferences/security-control");
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/preferences/security-control", {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
