import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/affect/model", { method: "GET" });
}
