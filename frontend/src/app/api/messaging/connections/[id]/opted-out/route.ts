import { proxyToBackend } from "@/lib/proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return proxyToBackend(`/api/messaging/connections/${id}/opted-out`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
