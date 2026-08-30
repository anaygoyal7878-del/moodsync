import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToBackend("/api/clara/actions/confirm", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
