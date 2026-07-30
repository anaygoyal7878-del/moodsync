import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/wellness-memory", { method: "GET" });
}
