import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/weather/location");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/weather/location", { method: "POST", body, headers: { "Content-Type": "application/json" } });
}
