import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(`/api/workouts/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text().catch(() => "{}"),
  });
}
