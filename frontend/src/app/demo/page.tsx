import type { Metadata } from "next";
import { Nav } from "@/components/marketing/Nav";
import { DemoIndexGrid } from "@/components/demo/DemoIndexGrid";

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
            Nine automations, one intelligence layer
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-secondary">
            Each walkthrough plays out a MoodSync rule — a biometric or schedule condition, matched against your
            wearable, driving your smart home. The first five run on real integrations shipping today (Hue, Spotify,
            notifications); the rest are marked <span className="font-medium text-ink">Concept</span> — product
            vision for capabilities MoodSync doesn&apos;t build against yet. Pick one below.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24">
          <DemoIndexGrid />
        </section>
      </main>

      <footer className="border-t border-line px-6 py-10 text-center text-sm text-ink-muted">
        <p>MoodSync is the intelligence layer between your wearable and your smart home.</p>
      </footer>
    </div>
  );
}
