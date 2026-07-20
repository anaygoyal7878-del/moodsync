import { backendFetch } from "@/lib/api";
import { AutomationSection } from "@/components/dashboard/AutomationSection";
import type { AutomationRuleDefinition, AutomationHistoryEntry, ConnectionsResponse } from "@/lib/types";

export default async function AutomationPage() {
  const [connectionsResult, rulesResult, automationHistoryResult] = await Promise.all([
    backendFetch<ConnectionsResponse>("/api/connections"),
    backendFetch<{ rules: AutomationRuleDefinition[] }>("/api/automation-rules"),
    backendFetch<{ entries: AutomationHistoryEntry[] }>("/api/automation-history?limit=20"),
  ]);
  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [] };
  const rules = rulesResult.ok ? rulesResult.data.rules : [];
  const automationHistory = automationHistoryResult.ok ? automationHistoryResult.data.entries : [];
  const devices = connections.smartHome.flatMap((c) => c.devices);
  const spotifyConnected = connections.smartHome.some((c) => c.provider === "SPOTIFY" && c.status === "ACTIVE");

  // Wrapper is a walkthrough anchor only — see tourSteps.ts.
  return (
    <div data-tour="automations">
      <AutomationSection rules={rules} history={automationHistory} devices={devices} spotifyConnected={spotifyConnected} />
    </div>
  );
}
