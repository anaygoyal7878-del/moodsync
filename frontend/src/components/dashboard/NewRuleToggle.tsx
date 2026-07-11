"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RuleForm } from "./RuleForm";
import type { DeviceSummary } from "@/lib/types";

export function NewRuleToggle({ devices, spotifyConnected }: { devices: DeviceSummary[]; spotifyConnected: boolean }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        New rule
      </Button>
    );
  }

  return <RuleForm devices={devices} spotifyConnected={spotifyConnected} onCreated={() => setOpen(false)} />;
}
