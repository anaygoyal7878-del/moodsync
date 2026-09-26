import { proxyToBackend } from "@/lib/proxy";

export async function PUT(request: Request) {
  return proxyToBackend("/api/health-profile/units", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
