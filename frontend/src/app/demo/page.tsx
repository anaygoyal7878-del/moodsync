import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Button } from "@/components/ui/Button";
import { DemoExperience } from "@/components/demo/DemoExperience";

export const metadata: Metadata = {
  title: "Demo — MoodSync",
  description: "See how MoodSync reacts to a real recovery drop by automating your Hue lights and Spotify — simulated data, no account needed.",
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
            Watch MoodSync react to a real morning
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-secondary">
            This walkthrough plays out exactly what MoodSync does with your real WHOOP/Fitbit and Hue/Spotify
            connections — the numbers below are staged for the demo, not a live account.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20">
          <DemoExperience />
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
