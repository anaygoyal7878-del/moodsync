import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { backendFetch } from "@/lib/api";
import { EnvironmentAnalytics, type AnalyticsData } from "@/components/companion/EnvironmentAnalytics";

export default async function EnvironmentAnalyticsPage() {
  const result = await backendFetch<AnalyticsData>("/api/environment/analytics?days=30");

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/environment"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--lux-sage)" }}
      >
        <ChevronLeft size={16} aria-hidden />
        Environment
      </Link>
      <h1 className="text-2xl font-medium" style={{ color: "var(--lux-ink)" }}>
        What MoodSync has learned
      </h1>
      <p className="mb-6 mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
        Your last 30 days of suggestions, responses, and measured outcomes.
      </p>

      {result.ok ? (
        <EnvironmentAnalytics data={result.data} />
      ) : (
        <p
          className="glass-surface rounded-2xl p-6 text-sm"
          style={{ background: "var(--lux-bg-card)", color: "var(--lux-muted)" }}
        >
          Couldn’t load your analytics right now.
        </p>
      )}
    </div>
  );
}
