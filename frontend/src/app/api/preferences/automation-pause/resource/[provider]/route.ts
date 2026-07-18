import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const body = await request.text();
  return proxyToBackend(`/api/preferences/automation-pause/resource/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return proxyToBackend(`/api/preferences/automation-pause/resource/${provider}`, { method: "DELETE" });
}
