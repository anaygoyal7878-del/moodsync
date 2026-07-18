import { Card } from "@/components/ui/Card";
import { AutomationDemo } from "./AutomationDemo";
import type { DemoScenario } from "./AutomationDemo";

/** Maps each scenario to the wellness-state accent (see the --mood-*
 * tokens in globals.css) it's actually about, so the "dynamic color
 * system" from the brand brief shows up somewhere a visitor actually
 * feels it — the whole scenario page's accent (buttons, matched-rule
 * highlight, active chips) shifts to match instead of every scenario
 * using the same default green. A direct content mapping, not a guess:
 * each key names the real thing the scenario demonstrates. */
const SCENARIO_MOOD: Record<string, string> = {
  "wind-down": "sleep",
  "sleep-prep": "sleep",
  "sleep-security": "sleep",
  "stress-relief": "calm",
  "focus-mode": "focus",
  "recovery-intelligence": "recovery",
  "arrival-intelligence": "morning",
  "weather-wellness": "calm",
  "calendar-prep": "focus",
};

/** Header (emoji/title/concept badge/description) + the interactive
 * walkthrough itself — the full content of a single scenario's own page. */
export function ScenarioCard({ scenario }: { scenario: DemoScenario }) {
  const mood = SCENARIO_MOOD[scenario.id];

  return (
    <div className="mood-transition flex flex-col gap-6" data-mood={mood}>
      <div className="text-center">
        <p className="text-2xl" aria-hidden="true">
          {scenario.emoji}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{scenario.title}</h1>
          {scenario.concept && (
            <span className="inline-flex items-center rounded-full border border-line-strong bg-surface-raised px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Concept
            </span>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">{scenario.description}</p>
        {scenario.concept && (
          <p className="mx-auto mt-1 max-w-xl text-xs text-ink-muted">
            Not a real integration yet — shown to illustrate where MoodSync is headed.
          </p>
        )}
      </div>
      <Card variant="glass" className="p-6 sm:p-8">
        <AutomationDemo scenario={scenario} />
      </Card>
    </div>
  );
}
