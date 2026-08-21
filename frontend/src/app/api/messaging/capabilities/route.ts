import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/messaging/capabilities", { method: "GET" });
}
