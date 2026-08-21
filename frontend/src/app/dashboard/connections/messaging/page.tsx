import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { backendFetch } from "@/lib/api";
import { MessagingConnectCard } from "@/components/companion/MessagingConnectCard";
import { MessagingSettingsForm } from "@/components/companion/MessagingSettingsForm";
import { MessagingMemoryPanel } from "@/components/companion/MessagingMemoryPanel";
import { MessagingCapabilities } from "@/components/companion/MessagingCapabilities";

type Settings = Parameters<typeof MessagingSettingsForm>[0]["initial"];

/**
 * The iMessage bot's own settings screen.
 *
 * Ordered by what a person actually needs to decide, in order: is it
 * connected, what can it do, when may it interrupt me, and what does it
 * know about me. The interruption controls sit above the memory panel
 * because "stop texting me at 2am" is a more urgent need than "forget
 * that I prefer mornings".
 */
export default async function MessagingSettingsPage() {
  const settings = await backendFetch<Settings>("/api/messaging/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href="/dashboard/connections"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--lux-sage)" }}
      >
        <ChevronLeft size={16} aria-hidden />
        Connections
      </Link>
      <h1 className="text-2xl font-medium" style={{ color: "var(--lux-ink)" }}>
        Texting MoodSync
      </h1>
      <p className="mb-8 mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
        Ask it anything from your Messages app. It answers from your real data, and only texts you
        first on your terms.
      </p>

      <div className="space-y-4">
        <MessagingConnectCard />
        <MessagingCapabilities />

        <section className="glass-surface rounded-2xl p-5" style={{ background: "var(--lux-bg-card)" }}>
          <h2 className="mb-4 text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
            When it may text you first
          </h2>
          {settings.ok ? (
            <MessagingSettingsForm initial={settings.data} />
          ) : (
            <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
              Couldn’t load these settings right now.
            </p>
          )}
        </section>

        <MessagingMemoryPanel />

        <p className="px-1 text-xs" style={{ color: "var(--lux-muted)" }}>
          You can always text STOP to stop everything, including replies. These settings only govern
          messages MoodSync starts.
        </p>
      </div>
    </div>
  );
}
