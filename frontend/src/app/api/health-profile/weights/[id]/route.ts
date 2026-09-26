import { proxyToBackend } from "@/lib/proxy";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/health-profile/weights/${id}`, { method: "DELETE" });
}
