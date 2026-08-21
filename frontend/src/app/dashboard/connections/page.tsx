import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { backendFetch } from "@/lib/api";
import { ConnectErrorBanner } from "@/components/dashboard/ConnectErrorBanner";
import { ConnectionsSection } from "@/components/dashboard/ConnectionsSection";
import { MessagingConnectCard } from "@/components/companion/MessagingConnectCard";
import type { ConnectionsResponse } from "@/lib/types";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [connectionsResult, { error }] = await Promise.all([
    backendFetch<ConnectionsResponse>("/api/connections"),
    searchParams,
  ]);
  const connections: ConnectionsResponse = connectionsResult.ok
    ? connectionsResult.data
    : { wearables: [], smartHome: [], appleMusic: null, calendar: null };

  return (
    <div className="flex flex-col gap-6">
      {error && <ConnectErrorBanner error={error} />}
      <ConnectionsSection connections={connections} />
      <MessagingConnectCard />
      {/* The card above is the connect flow; everything else about the
          bot — when it may text first, what it remembers, what it can
          actually do — lives on its own screen rather than growing this
          page indefinitely. */}
      <Link
        href="/dashboard/connections/messaging"
        className="glass-surface flex items-center justify-between rounded-2xl p-4 text-sm"
        style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)" }}
      >
        <span>
          Texting settings
          <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
            Quiet hours, how often it can text first, and what it remembers about you.
          </span>
        </span>
        <ChevronRight size={16} aria-hidden style={{ color: "var(--lux-sage)" }} />
      </Link>
    </div>
  );
}
