import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const integrations = [
  { name: "WHOOP", status: "Connect today" },
  { name: "Philips Hue", status: "Connect today" },
  { name: "Fitbit", status: "Via Google Health" },
  { name: "Spotify", status: "Limited beta" },
  { name: "Garmin", status: "Coming soon" },
  { name: "Ecobee", status: "Coming soon" },
];

const features = [
  {
    title: "Reads your recovery",
    body: "MoodSync watches your recovery score, sleep, and strain — not just a single number — so its recommendations reflect how your whole day is actually going.",
  },
  {
    title: "Acts on your behalf",
    body: "When your recovery drops, MoodSync can dim your lights, shift your color temperature, or trigger a scene automatically, without you touching an app.",
  },
  {
    title: "Transparent by default",
    body: "Every automation is logged: what fired, why, and when. No black box — your automation history is always one click away.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-20 text-center sm:pt-32">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            Now connecting WHOOP + Philips Hue
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            The intelligence layer between your wearable and your home
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-secondary">
            MoodSync doesn&apos;t make hardware. It reads your biometric signals and automatically
            adapts the smart home devices you already own — no new gadget required.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link href="/signup">
              <Button variant="primary" className="px-6 py-3 text-base">
                Get started free
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="secondary" className="px-6 py-3 text-base">
                See how it works
              </Button>
            </Link>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} raised>
                <h3 className="text-lg font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{feature.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="integrations" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Built on real, verified integrations</h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-secondary">
              We only claim an integration once it&apos;s implemented against a platform&apos;s actual,
              current developer documentation. No invented APIs, no vaporware badges.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {integrations.map((integration) => (
              <Card key={integration.name} className="flex items-center justify-between">
                <span className="font-medium">{integration.name}</span>
                <span className="text-xs text-ink-muted">{integration.status}</span>
              </Card>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Free while in beta</h2>
          <p className="mt-3 text-ink-secondary">
            MoodSync is currently free for early users connecting WHOOP and Philips Hue. Pricing for
            additional integrations will be announced as they leave beta.
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
