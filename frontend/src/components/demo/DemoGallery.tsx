import { Card } from "@/components/ui/Card";
import { AutomationDemo } from "./AutomationDemo";
import { DEMO_SCENARIOS } from "./scenarios";

export function DemoGallery() {
  return (
    <div className="flex flex-col gap-16">
      {DEMO_SCENARIOS.map((scenario) => (
        <div key={scenario.id} id={scenario.id} className="flex flex-col gap-6">
          <div className="text-center">
            <p className="text-2xl" aria-hidden="true">
              {scenario.emoji}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{scenario.title}</h2>
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
          <Card raised className="p-6 sm:p-8">
            <AutomationDemo scenario={scenario} />
          </Card>
        </div>
      ))}
    </div>
  );
}
