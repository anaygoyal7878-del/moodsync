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
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{scenario.title}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">{scenario.description}</p>
          </div>
          <Card raised className="p-6 sm:p-8">
            <AutomationDemo scenario={scenario} />
          </Card>
        </div>
      ))}
    </div>
  );
}
