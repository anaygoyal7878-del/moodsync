"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RuleForm } from "./RuleForm";
import type { DeviceSummary } from "@/lib/types";

export function NewRuleToggle({ devices, spotifyConnected }: { devices: DeviceSummary[]; spotifyConnected: boolean }) {
  // Arriving from QuickActions.tsx's `?template=<id>` deep link should
  // land with the form already open, not require an extra click on top
  // of the one that got here — RuleForm.tsx reads the same param to
  // actually apply the template once mounted.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.has("template"));

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        New rule
      </Button>
    );
  }

  return <RuleForm devices={devices} spotifyConnected={spotifyConnected} onCreated={() => setOpen(false)} />;
}
