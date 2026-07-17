import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Button } from "@/components/ui/Button";
import { DemoGallery } from "@/components/demo/DemoGallery";
import { DEMO_SCENARIOS } from "@/components/demo/scenarios";

export const metadata: Metadata = {
  title: "Demo — MoodSync",
  description: "See how MoodSync reacts to real biometric signals by automating your Hue lights, Spotify, and notifications — simulated data, no account needed.",
};

export default function DemoPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-8 text-center sm:pt-24">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Simulated data — no wearable or account required
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Five automations, one intelligence layer
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-secondary">
            Each walkthrough below plays out a real MoodSync rule — a biometric or schedule condition, matched
            against your wearable, driving your Hue lights, Spotify, and notifications. Every action shown is
            something the product does today; the numbers are staged for the demo, not a live account.
          </p>
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Jump to a demo">
            {DEMO_SCENARIOS.map((scenario) => (
              <a
                key={scenario.id}
                href={`#${scenario.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
              >
                <span aria-hidden="true">{scenario.emoji}</span>
                {scenario.title}
              </a>
            ))}
          </nav>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20">
          <DemoGallery />
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
