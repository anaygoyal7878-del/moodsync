import { proxyToBackend } from "@/lib/proxy";

export async function POST() {
  return proxyToBackend("/api/integrations/whoop/sync", { method: "POST" });
}
