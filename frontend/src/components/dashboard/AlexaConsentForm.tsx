"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface AlexaConsentFormProps {
  clientId: string;
  redirectUri: string;
  scope: string;
  amazonState: string;
}

export function AlexaConsentForm({ clientId, redirectUri, scope, amazonState }: AlexaConsentFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/integrations/alexa/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, redirectUri, scope, amazonState }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Couldn't complete account linking. Please try again.");
        setStatus("error");
        return;
      }
      const { redirectUrl } = await response.json();
      window.location.href = redirectUrl;
    } catch {
      setError("Couldn't reach MoodSync. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "denied") {
    return <p className="mt-6 text-sm text-ink-secondary">You can close this window.</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="primary" onClick={handleApprove} disabled={status === "loading"}>
        {status === "loading" ? "Linking…" : "Allow"}
      </Button>
      <Button variant="ghost" onClick={() => setStatus("denied")} disabled={status === "loading"}>
        Deny
      </Button>
    </div>
  );
}
