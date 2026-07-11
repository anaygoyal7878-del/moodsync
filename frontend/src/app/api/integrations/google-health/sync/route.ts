import { proxyToBackend } from "@/lib/proxy";

export async function POST() {
  return proxyToBackend("/api/integrations/google-health/sync", { method: "POST" });
}
