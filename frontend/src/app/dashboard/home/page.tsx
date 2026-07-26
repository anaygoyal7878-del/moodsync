import { backendFetch } from "@/lib/api";
import { LuxuryHome } from "@/components/luxury/LuxuryHome";
import type { HomeSnapshotResponse } from "@/lib/types";

export default async function HomePage() {
  const [snapshotResult, securityResult] = await Promise.all([
    backendFetch<HomeSnapshotResponse>("/api/home"),
    backendFetch<{ enabled: boolean }>("/api/preferences/security-control"),
  ]);

  const snapshot = snapshotResult.ok ? snapshotResult.data.snapshot : null;
  const securityControlEnabled = securityResult.ok ? securityResult.data.enabled : false;

  return <LuxuryHome snapshot={snapshot} securityControlEnabled={securityControlEnabled} />;
}
