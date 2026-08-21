import { proxyToBackend } from "@/lib/proxy";

export async function GET(request: Request) {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  return proxyToBackend(`/api/environment/analytics?days=${encodeURIComponent(days)}`, { method: "GET" });
}
