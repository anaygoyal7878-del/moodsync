import { backendFetch } from "@/lib/api";
import { LuxuryHome } from "@/components/luxury/LuxuryHome";
import type { HomeSnapshotResponse } from "@/lib/types";

export default async function HomePage() {
  const [snapshotResult, securityResult] = await Promise.all([
    backendFetch<HomeSnapshotResponse>("/api/home"),
    backendFetch<{ enabled: boolean }>("/api/preferences/security-control"),
  ]);

  const snapshot = snapshotResult.ok ? snapshotResult.data.snapshot : null;
  const roomWellness = snapshotResult.ok ? snapshotResult.data.roomWellness : [];
  const overallWellness = snapshotResult.ok ? snapshotResult.data.overallWellness : undefined;
  const securityControlEnabled = securityResult.ok ? securityResult.data.enabled : false;

  return (
    <LuxuryHome
      snapshot={snapshot}
      securityControlEnabled={securityControlEnabled}
      roomWellness={roomWellness}
      overallWellness={overallWellness}
    />
  );
}
