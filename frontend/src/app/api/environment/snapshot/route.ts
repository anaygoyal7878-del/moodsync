import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/environment/snapshot", { method: "GET" });
}
