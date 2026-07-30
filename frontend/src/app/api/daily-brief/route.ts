import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/daily-brief", { method: "GET" });
}
