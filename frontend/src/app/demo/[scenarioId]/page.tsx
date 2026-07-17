import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/marketing/Nav";
import { Button } from "@/components/ui/Button";
import { ScenarioCard } from "@/components/demo/ScenarioCard";
import { DEMO_SCENARIOS } from "@/components/demo/scenarios";

export function generateStaticParams() {
  return DEMO_SCENARIOS.map((scenario) => ({ scenarioId: scenario.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}): Promise<Metadata> {
  const { scenarioId } = await params;
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return { title: "Demo — MoodSync" };
  return {
    title: `${scenario.title} — MoodSync Demo`,
    description: scenario.description,
  };
}

export default async function ScenarioPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 pt-12 pb-4">
          <Link href="/demo" className="text-sm text-ink-secondary transition-colors hover:text-ink">
            ← All demos
          </Link>
        </section>

        <section className="mx-auto max-w-2xl px-6 pb-20">
          <ScenarioCard scenario={scenario} />
        </section>

        <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to connect your own?</h2>
          <p className="mt-3 text-ink-secondary">
            Create a free account and connect WHOOP, Fitbit, Philips Hue, or Spotify — every automation you build
            runs against your real data from here on.
          </p>
          <Link href="/signup" className="mt-6 inline-block">
            <Button variant="primary" className="px-6 py-3 text-base">
              Get started free
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-10 text-center text-sm text-ink-muted">
        <p>MoodSync is the intelligence layer between your wearable and your smart home.</p>
      </footer>
    </div>
  );
}
