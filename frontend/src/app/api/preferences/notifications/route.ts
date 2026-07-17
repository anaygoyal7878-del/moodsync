import { proxyToBackend } from "@/lib/proxy";

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/preferences/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
