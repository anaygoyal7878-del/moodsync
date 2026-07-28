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
  const [meResult, connectionsResult, weatherLocationResult, sleepTempRangeResult] = await Promise.all([
    backendFetch<MeResponse>("/api/me"),
    backendFetch<ConnectionsResponse>("/api/connections"),
    backendFetch<{ location: { name: string; lat: number; lng: number } | null }>("/api/weather/location"),
    backendFetch<{ range: { min: number; max: number } | null }>("/api/preferences/sleep-temp-range"),
  ]);

  if (!meResult.ok) {
    return (
      <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
        Couldn&apos;t load your account details.
      </p>
    );
  }

  const connections: ConnectionsResponse = connectionsResult.ok ? connectionsResult.data : { wearables: [], smartHome: [], appleMusic: null, calendar: null };
  const weatherLocationName = weatherLocationResult.ok ? (weatherLocationResult.data.location?.name ?? null) : null;
  const sleepTempRange = sleepTempRangeResult.ok ? sleepTempRangeResult.data.range : null;

  return (
    <LuxuryProfile
      me={meResult.data}
      connections={connections}
      weatherLocationName={weatherLocationName}
      sleepTempRange={sleepTempRange}
    />
  );
}
