"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Music, Smartphone, Thermometer, Mic, Bell, BellOff, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AutomationRuleDefinition } from "@/lib/types";

function summarizeCondition(c: AutomationRuleDefinition["conditions"][number]): string {
  const operators: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" };
  return `${c.field} ${operators[c.operator] ?? c.operator} ${c.value}`;
}

function summarizeAction(a: AutomationRuleDefinition["actions"][number]): string {
  return a.type;
}

/** First action's provider decides the row's icon — a rule with
 * multiple actions across different providers is rare and this is just
 * a visual hint, not a claim about everything the rule does (the full
 * condition/action text below it is still the source of truth). */
const PROVIDER_ICONS: Record<string, typeof Lightbulb> = {
  hue: Lightbulb,
  spotify: Music,
  homekit: Smartphone,
  ecobee: Thermometer,
  alexa: Mic,
  notification: Bell,
};

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

  const Icon = PROVIDER_ICONS[rule.actions[0]?.provider ?? ""] ?? Zap;

  return (
    <Card className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-secondary">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{rule.name}</p>
            <Badge variant={rule.enabled ? "success" : "neutral"} dot>
              {rule.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {rule.notificationsEnabled === false && (
              <span title="Notifications muted for this rule" className="text-ink-muted">
                <BellOff size={13} aria-hidden="true" />
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            {rule.conditions.length > 0 ? rule.conditions.map(summarizeCondition).join(" and ") : "scheduled"}
            {rule.timeWindow ? ` (${rule.timeWindow.start}-${rule.timeWindow.end})` : ""} &rarr;{" "}
            {rule.actions.map(summarizeAction).join(", ")} &middot; {rule.cooldownMinutes}m cooldown &middot; priority{" "}
            {rule.priority}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" disabled={pending} onClick={toggleEnabled}>
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={deleteRule}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
