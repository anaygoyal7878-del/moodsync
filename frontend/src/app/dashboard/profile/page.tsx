import { backendFetch } from "@/lib/api";
import { LuxuryProfile } from "@/components/luxury/LuxuryProfile";
import type { ConnectionsResponse } from "@/lib/types";

interface MeResponse {
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

/** Ported from the Superdesign User Profile draft — see
 * LuxuryProfile.tsx's doc comment for exactly which sections are real
 * vs. dropped. Same /api/me the dashboard layout's auth gate already
 * calls, plus /api/connections for the Integrations list. */
export default async function ProfilePage() {
  const [meResult, connectionsResult] = await Promise.all([
    backendFetch<MeResponse>("/api/me"),
    backendFetch<ConnectionsResponse>("/api/connections"),
  ]);

  if (!meResult.ok) {
    return (
      <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
        Couldn&apos;t load your account details.
      </p>
    );
  }

  const connections: ConnectionsResponse = connectionsResult.ok ? connectionsResult.data : { wearables: [], smartHome: [] };

  return <LuxuryProfile me={meResult.data} connections={connections} />;
}
