import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DEMO_SCENARIOS } from "./scenarios";

export function DemoIndexGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DEMO_SCENARIOS.map((scenario) => (
        <Link key={scenario.id} href={`/demo/${scenario.id}`}>
          <Card
            raised
            className="flex h-full flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">
                {scenario.emoji}
              </span>
              <h2 className="text-base font-semibold tracking-tight">{scenario.title}</h2>
              {scenario.concept && (
                <span className="ml-auto inline-flex items-center rounded-full border border-line-strong bg-surface-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                  Concept
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">{scenario.description}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
