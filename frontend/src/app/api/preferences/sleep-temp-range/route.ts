import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/preferences/sleep-temp-range");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/preferences/sleep-temp-range", { method: "POST", body, headers: { "Content-Type": "application/json" } });
}
