import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/preferences/automation-pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function DELETE() {
  return proxyToBackend("/api/preferences/automation-pause", { method: "DELETE" });
}
