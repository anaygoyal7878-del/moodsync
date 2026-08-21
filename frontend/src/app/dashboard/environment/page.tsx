import { backendFetch } from "@/lib/api";
import Link from "next/link";
import { Settings2, BarChart3 } from "lucide-react";
import { EnvironmentCard } from "@/components/companion/EnvironmentCard";

/**
 * The Adaptive Environment surface. Server-rendered so the state
 * assessment is computed fresh on load rather than flashing a stale
 * card — this page's whole value is being current.
 */
export default async function EnvironmentPage() {
  const result = await backendFetch<Parameters<typeof EnvironmentCard>[0]["snapshot"]>("/api/environment/snapshot");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium" style={{ color: "var(--lux-ink)" }}>
            Environment
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
            What MoodSync notices, and what it can adjust.
          </p>
        </div>
        <div className="flex gap-2">
        <Link
          href="/dashboard/environment/analytics"
          className="control-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--lux-muted)", color: "var(--lux-ink)", minHeight: 44 }}
        >
          <BarChart3 size={15} aria-hidden />
          Analytics
        </Link>
        <Link
          href="/dashboard/environment/settings"
          className="control-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--lux-muted)", color: "var(--lux-ink)", minHeight: 44 }}
        >
          <Settings2 size={15} aria-hidden />
          Settings
        </Link>
        </div>
      </div>

      {result.ok ? (
        <EnvironmentCard snapshot={result.data} />
      ) : (
        // A failed read says so rather than rendering an empty card that
        // reads as "nothing is happening".
        <p
          className="glass-surface rounded-2xl p-6 text-sm"
          style={{ background: "var(--lux-bg-card)", color: "var(--lux-muted)" }}
        >
          Couldn’t load your environment right now. Try again in a moment.
        </p>
      )}
    </div>
  );
}
