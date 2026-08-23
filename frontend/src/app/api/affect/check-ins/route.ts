import { proxyToBackend } from "@/lib/proxy";

export async function GET() {
  return proxyToBackend("/api/affect/check-ins", { method: "GET" });
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/affect/check-ins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
