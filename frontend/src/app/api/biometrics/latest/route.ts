import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/biometrics/latest", { method: "GET" });
}
