"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** The manual-override control from docs/DECISION_ENGINE_ARCHITECTURE.md
 * — a single, simple "pause everything for an hour" rather than
 * per-resource overrides (a roadmap refinement). Dispatch checks
 * UserPreferences.automationsPausedUntil before evaluating anything. */
export function PauseAutomationsButton({ isPaused }: { isPaused: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function pause() {
    setPending(true);
    await fetch("/api/preferences/automation-pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 60 }),
    });
    router.refresh();
    setPending(false);
  }

  async function resume() {
    setPending(true);
    await fetch("/api/preferences/automation-pause", { method: "DELETE" });
    router.refresh();
    setPending(false);
  }

  return (
    <Button variant="ghost" disabled={pending} onClick={isPaused ? resume : pause}>
      {isPaused ? "Resume automations" : "Pause automations for 1 hour"}
    </Button>
  );
}
