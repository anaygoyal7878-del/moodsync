import { proxyToBackend } from "@/lib/proxy";

export async function POST() {
  return proxyToBackend("/api/environment/proposals", { method: "POST" });
}
