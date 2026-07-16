"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AutomationRuleDefinition } from "@/lib/types";

function summarizeCondition(c: AutomationRuleDefinition["conditions"][number]): string {
  const operators: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" };
  return `${c.field} ${operators[c.operator] ?? c.operator} ${c.value}`;
}

function summarizeAction(a: AutomationRuleDefinition["actions"][number]): string {
  return a.type;
}

export function RuleRow({ rule }: { rule: AutomationRuleDefinition }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggleEnabled() {
    setPending(true);
    await fetch(`/api/automation-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    router.refresh();
    setPending(false);
  }

  async function deleteRule() {
    setPending(true);
    await fetch(`/api/automation-rules/${rule.id}`, { method: "DELETE" });
    router.refresh();
    setPending(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div>
        <p className="text-sm font-medium">{rule.name}</p>
        <p className="text-xs text-ink-muted">
          {rule.conditions.length > 0 ? rule.conditions.map(summarizeCondition).join(" and ") : "scheduled"}
          {rule.timeWindow ? ` (${rule.timeWindow.start}-${rule.timeWindow.end})` : ""} &rarr;{" "}
          {rule.actions.map(summarizeAction).join(", ")} &middot; {rule.cooldownMinutes}m cooldown &middot; priority{" "}
          {rule.priority}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" disabled={pending} onClick={toggleEnabled}>
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={deleteRule}>
          Delete
        </Button>
      </div>
    </div>
  );
}
