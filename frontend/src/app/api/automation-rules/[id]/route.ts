import { proxyToBackend } from "@/lib/proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyToBackend(`/api/automation-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/automation-rules/${id}`, { method: "DELETE" });
}
