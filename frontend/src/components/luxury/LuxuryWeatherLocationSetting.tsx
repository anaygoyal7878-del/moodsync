"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudSun } from "lucide-react";

/** Sets the free-text location weather-dependent features read (Music
 * Intelligence's "Rainy Day" category, the room-temperature-vs-sleep-
 * range smart notification). No account linking — Open-Meteo needs no
 * OAuth, this just geocodes the typed text once. See
 * docs/WEATHER_INTEGRATION.md. */
export function LuxuryWeatherLocationSetting({ initialLocationName }: { initialLocationName: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/weather/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "Couldn't find that location");
      return;
    }
    setQuery("");
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-3xl p-4"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lux-bg-card-2)" }}>
          <CloudSun size={16} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-medium" style={{ color: "var(--lux-ink)" }}>
            Weather location
          </span>
          <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
            {initialLocationName ? `Currently: ${initialLocationName}` : "Not set — weather-aware features are off"}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City, e.g. Austin, TX"
          className="flex-1 rounded-full px-4 py-2 text-[13px]"
          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
        />
        <button
          onClick={save}
          disabled={busy || !query.trim()}
          className="rounded-full px-4 py-2 text-[13px] font-medium"
          style={{ background: "var(--lux-sage)", color: "#1a241e" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--lux-rose)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
