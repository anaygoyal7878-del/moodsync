import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/health-profile");
}

export async function PUT(request: Request) {
  return proxyToBackend("/api/health-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}

/** Deletes the health profile and weight log, leaving the account intact. */
export async function DELETE() {
  return proxyToBackend("/api/health-profile", { method: "DELETE" });
}
