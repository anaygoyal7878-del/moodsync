import { proxyToBackend } from "@/lib/proxy";

const DISCONNECTABLE_PROVIDERS = ["whoop", "hue"] as const;
type DisconnectableProvider = (typeof DISCONNECTABLE_PROVIDERS)[number];

function isDisconnectable(value: string): value is DisconnectableProvider {
  return (DISCONNECTABLE_PROVIDERS as readonly string[]).includes(value);
}

export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isDisconnectable(provider)) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 404 });
  }

  return proxyToBackend(`/api/integrations/${provider}`, { method: "DELETE" });
}
