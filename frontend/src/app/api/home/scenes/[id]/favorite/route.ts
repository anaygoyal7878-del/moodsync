import { proxyToBackend } from "@/lib/proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyToBackend(`/api/home/scenes/${id}/favorite`, {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
