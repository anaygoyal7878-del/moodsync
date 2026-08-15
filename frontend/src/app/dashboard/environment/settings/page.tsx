import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { backendFetch } from "@/lib/api";
import { EnvironmentSettingsForm } from "@/components/companion/EnvironmentSettingsForm";

type Settings = Parameters<typeof EnvironmentSettingsForm>[0]["initial"];

export default async function EnvironmentSettingsPage() {
  const result = await backendFetch<Settings>("/api/environment/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href="/dashboard/environment"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--lux-sage)" }}
      >
        <ChevronLeft size={16} aria-hidden />
        Environment
      </Link>
      <h1 className="text-2xl font-medium" style={{ color: "var(--lux-ink)" }}>
        Automation settings
      </h1>
      <p className="mb-8 mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
        MoodSync starts by only suggesting. You decide if it ever does more.
      </p>

      {result.ok ? (
        <EnvironmentSettingsForm initial={result.data} />
      ) : (
        <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
          Couldn’t load your settings right now.
        </p>
      )}
    </div>
  );
}
