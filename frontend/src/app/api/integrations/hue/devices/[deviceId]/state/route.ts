import { proxyToBackend } from "@/lib/proxy";

export async function PUT(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const body = await request.text();

  return proxyToBackend(`/api/integrations/hue/devices/${deviceId}/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
