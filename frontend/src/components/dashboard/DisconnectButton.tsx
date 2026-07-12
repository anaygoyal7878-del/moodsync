"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DisconnectButton({
  provider,
}: {
  provider: "whoop" | "hue" | "google-health" | "spotify" | "apple-health";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button variant="ghost" onClick={handleDisconnect} disabled={loading}>
      {loading ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
