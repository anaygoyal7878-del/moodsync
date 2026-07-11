import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { backendFetch } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/marketing/LogoutButton";
import { ConnectionsSection } from "@/components/dashboard/ConnectionsSection";
import { DevicesSection } from "@/components/dashboard/DevicesSection";
import { BiometricsSection } from "@/components/dashboard/BiometricsSection";
import { AutomationSection } from "@/components/dashboard/AutomationSection";
import type { ConnectionsResponse, AutomationRuleDefinition, AutomationHistoryEntry } from "@/lib/types";
import type { NormalizedBiometricReading } from "@moodsync/shared";

interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

async function fetchCurrentUser(): Promise<MeResponse | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const response = await fetch(`${BACKEND_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function DashboardPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  const [connectionsResult, latestResult, historyResult, rulesResult, automationHistoryResult] = await Promise.all([
    backendFetch<ConnectionsResponse>("/api/connections"),
    backendFetch<{ reading: NormalizedBiometricReading | null }>("/api/biometrics/latest"),
    backendFetch<{ readings: NormalizedBiometricReading[] }>("/api/biometrics/history?days=7"),
    backendFetch<{ rules: AutomationRuleDefinition[] }>("/api/automation-rules"),
    backendFetch<{ entries: AutomationHistoryEntry[] }>("/api/automation-history?limit=20"),
  ]);

  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [] };
  const latest = latestResult.ok ? latestResult.data.reading : null;
  const history = historyResult.ok ? historyResult.data.readings : [];
  const rules = rulesResult.ok ? rulesResult.data.rules : [];
  const automationHistory = automationHistoryResult.ok ? automationHistoryResult.data.entries : [];
  const devices = connections.smartHome.flatMap((c) => c.devices);

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <LogoutButton />
      </div>

      <Card raised>
        <p className="text-xs uppercase tracking-wide text-ink-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold">{user.email}</p>
      </Card>

      <ConnectionsSection connections={connections} />
      <BiometricsSection latest={latest} history={history} />
      <DevicesSection devices={devices} />
      <AutomationSection rules={rules} history={automationHistory} devices={devices} />
    </div>
  );
}
