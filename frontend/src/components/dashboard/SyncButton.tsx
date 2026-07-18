"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function SyncButton({ provider }: { provider: "whoop" | "google-health" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handleSync() {
    setState("loading");
    const response = await fetch(`/api/integrations/${provider}/sync`, { method: "POST" });
    setState(response.ok ? "idle" : "error");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={handleSync} disabled={state === "loading"}>
        {state === "loading" ? "Syncing…" : "Sync now"}
      </Button>
      {state === "error" && <span className="text-xs text-danger">Sync failed</span>}
    </div>
  );
}
