import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/burnout-check", { method: "GET" });
}
