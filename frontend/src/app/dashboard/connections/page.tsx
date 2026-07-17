import { backendFetch } from "@/lib/api";
import { ConnectErrorBanner } from "@/components/dashboard/ConnectErrorBanner";
import { ConnectionsSection } from "@/components/dashboard/ConnectionsSection";
import type { ConnectionsResponse } from "@/lib/types";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [connectionsResult, { error }] = await Promise.all([
    backendFetch<ConnectionsResponse>("/api/connections"),
    searchParams,
  ]);
  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [] };

  return (
    <div className="flex flex-col gap-6">
      {error && <ConnectErrorBanner error={error} />}
      <ConnectionsSection connections={connections} />
    </div>
  );
}
