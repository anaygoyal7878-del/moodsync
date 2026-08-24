"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DisconnectButton({
  provider,
}: {
  provider:
    | "whoop"
    | "hue"
    | "google-health"
    | "spotify"
    | "apple-health"
    | "alexa"
    | "amazfit"
    | "apple-music"
    | "google-calendar";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" onClick={handleDisconnect} disabled={loading}>
        {loading ? "Disconnecting…" : "Disconnect"}
      </Button>
      {error && <span className="text-xs text-danger">Disconnect failed</span>}
    </div>
  );
}
