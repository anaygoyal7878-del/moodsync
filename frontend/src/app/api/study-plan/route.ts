import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/study-plan", { method: "GET" });
}
