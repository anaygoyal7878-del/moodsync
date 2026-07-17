import { proxyToBackend } from "@/lib/proxy";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/recommendations/${id}/dismiss`, { method: "POST" });
}
