import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const integrations = [
  { name: "WHOOP", status: "Connect today" },
  { name: "Philips Hue", status: "Connect today" },
  { name: "Fitbit", status: "Via Google Health" },
  { name: "Spotify", status: "Limited beta" },
  { name: "Garmin", status: "Blocked upstream" },
  { name: "Ecobee", status: "Blocked upstream" },
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
        <section className="relative overflow-hidden">
          {/* Ambient light glows, not a literal scene — evokes morning
           * light through a forest canopy without a clichéd leaf/nature
           * photo or (the previous hero) a robot/AI-generated-human
           * video, which is exactly the generic-AI-startup look this
           * product's visual identity is meant to stand apart from. */}
          <div className="pointer-events-none absolute inset-0 z-0 bg-canvas" aria-hidden="true">
            <div
              className="animate-ambient-drift absolute -top-32 -left-24 h-[32rem] w-[32rem] rounded-full opacity-[0.16] blur-[110px]"
              style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)" }}
            />
            <div
              className="animate-ambient-drift absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full opacity-[0.14] blur-[110px]"
              style={{ background: "radial-gradient(circle, var(--gold), transparent 70%)", animationDelay: "-6s" }}
            />
            <div
              className="animate-ambient-drift absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full opacity-[0.12] blur-[110px]"
              style={{ background: "radial-gradient(circle, var(--terracotta), transparent 70%)", animationDelay: "-11s" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-canvas/10 via-canvas/60 to-canvas" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 text-center sm:pt-32">
            <p className="animate-fade-in-up mb-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
              Now connecting WHOOP, Fitbit, Hue &amp; Spotify
            </p>
            <h1
              className="animate-fade-in-up text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              The intelligence layer between your wearable and your home
            </h1>
            <p
              className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-secondary"
              style={{ animationDelay: "160ms" }}
            >
              MoodSync doesn&apos;t make hardware. It reads your biometric signals and automatically
              adapts the smart home devices you already own — no new gadget required.
            </p>
            <div className="animate-fade-in-up mt-10 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link href="/signup">
                <Button variant="primary" className="px-6 py-3 text-base">
                  Get started free
                </Button>
              </Link>
              <Link href="/demo">
                <Button variant="secondary" className="px-6 py-3 text-base">
                  Watch the demo
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="ghost" className="px-6 py-3 text-base">
                  See how it works
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {features.map((feature) => (
              <Card
                key={feature.title}
                variant="glass"
                className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
              >
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
