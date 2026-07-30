import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/sleep-coach", { method: "GET" });
}
