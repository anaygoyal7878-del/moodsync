import { Card } from "@/components/ui/Card";
import { RuleRow } from "./RuleRow";
import { NewRuleToggle } from "./NewRuleToggle";
import type { AutomationRuleDefinition, AutomationHistoryEntry, DeviceSummary } from "@/lib/types";

const OUTCOME_LABELS: Record<AutomationHistoryEntry["outcome"], string> = {
  EXECUTED: "Executed",
  SKIPPED_COOLDOWN: "Skipped (cooldown)",
  SKIPPED_DISABLED: "Skipped (disabled)",
  FAILED: "Failed",
};

export function AutomationSection({
  rules,
  history,
  devices,
}: {
  rules: AutomationRuleDefinition[];
  history: AutomationHistoryEntry[];
  devices: DeviceSummary[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Automation rules</h2>
        <NewRuleToggle devices={devices} />
      </div>

      {rules.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-secondary">
            No rules yet. Create one to react to your biometrics automatically — e.g. dim the lights when your
            recovery score is low.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </div>
      )}

      <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Automation history</h2>
      {history.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-secondary">No automations have fired yet.</p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-1.5">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-secondary">{entry.rule.name}</span>
                <span
                  className={
                    entry.outcome === "EXECUTED"
                      ? "text-brand"
                      : entry.outcome === "FAILED"
                        ? "text-red-400"
                        : "text-ink-muted"
                  }
                >
                  {OUTCOME_LABELS[entry.outcome]}
                </span>
                <span className="text-xs text-ink-muted">{new Date(entry.executedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
