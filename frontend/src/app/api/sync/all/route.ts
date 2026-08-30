import { proxyToBackend } from "@/lib/proxy";

export async function POST() {
  return proxyToBackend("/api/sync/all", { method: "POST" });
}
