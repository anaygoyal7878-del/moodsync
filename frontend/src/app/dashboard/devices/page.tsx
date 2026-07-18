import { backendFetch } from "@/lib/api";
import { DevicesSection } from "@/components/dashboard/DevicesSection";
import type { ConnectionsResponse } from "@/lib/types";

export default async function DevicesPage() {
  const connectionsResult = await backendFetch<ConnectionsResponse>("/api/connections");
  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [] };

  return <DevicesSection smartHome={connections.smartHome} />;
}
