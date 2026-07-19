import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import MagicBento from "@/components/marketing/MagicBento";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CinematicHero } from "@/components/ui/cinematic-hero";
import { HeartRateWatch } from "@/components/marketing/HeartRateWatch";

const integrations = [
  { name: "WHOOP", status: "Connect today" },
  { name: "Philips Hue", status: "Connect today" },
  { name: "Fitbit", status: "Via Google Health" },
  { name: "Spotify", status: "Limited beta" },
  { name: "Garmin", status: "Blocked upstream" },
  { name: "Ecobee", status: "Blocked upstream" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <main className="flex-1">
        <CinematicHero />

        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Every heartbeat, read the moment it happens
            </h2>
            <p className="mt-4 max-w-md text-ink-secondary">
              WHOOP, Fitbit, and Apple Health all stream real heart-rate samples into MoodSync — not a daily
              average, a live signal your automations can actually react to. That&apos;s what triggers the
              lights dimming when your stress spikes, or your wind-down playlist starting before you even
              notice you need it.
            </p>
          </div>
          <HeartRateWatch />
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">What MoodSync actually does</h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-secondary">
              Six real, already-shipped capabilities — hover a card to see it react.
            </p>
          </div>
          <MagicBento
            textAutoHide
            enableStars
            enableSpotlight
            enableBorderGlow
            enableTilt
            enableMagnetism
            clickEffect
            spotlightRadius={300}
            particleCount={10}
          />
        </section>

        <section id="integrations" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Built on real, verified integrations</h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-secondary">
              We only claim an integration once it&apos;s implemented against a platform&apos;s actual,
              current developer documentation. No invented APIs, no vaporware badges — platforms we can&apos;t
              build against yet are labeled blocked, not &quot;coming soon.&quot;
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {integrations.map((integration) => (
              <Card key={integration.name} className="flex flex-col gap-1 transition-colors hover:bg-surface-hover">
                <span className="font-medium">{integration.name}</span>
                <span className="text-xs text-ink-muted">{integration.status}</span>
              </Card>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Free while in beta</h2>
          <p className="mt-3 text-ink-secondary">
            MoodSync is currently free for early users connecting WHOOP, Fitbit, Philips Hue, and Spotify.
            Pricing will be announced once these integrations leave beta.
          </p>
          <Link href="/signup" className="mt-8 inline-block">
            <Button variant="primary" className="px-6 py-3 text-base">
              Create your account
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
