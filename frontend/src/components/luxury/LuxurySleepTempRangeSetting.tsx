"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble } from "lucide-react";

/** Backs the "bedroom is warmer/cooler than your sleep range" smart
 * notification — see docs/SMART_NOTIFICATIONS.md. Celsius, matching
 * HomeRoomSnapshot.temperatureC's unit. */
export function LuxurySleepTempRangeSetting({ initialRange }: { initialRange: { min: number; max: number } | null }) {
  const router = useRouter();
  const [min, setMin] = useState(initialRange?.min?.toString() ?? "");
  const [max, setMax] = useState(initialRange?.max?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const minNum = Number(min);
    const maxNum = Number(max);
    if (!Number.isFinite(minNum) || !Number.isFinite(maxNum) || minNum >= maxNum) {
      setError("Enter a valid range (min less than max)");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/preferences/sleep-temp-range", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min: minNum, max: maxNum }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save your sleep temperature range");
      return;
    }
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-3xl p-4"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lux-bg-card-2)" }}>
          <BedDouble size={16} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-medium" style={{ color: "var(--lux-ink)" }}>
            Sleep temperature range
          </span>
          <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
            {initialRange ? `Currently: ${initialRange.min}°C - ${initialRange.max}°C` : "Not set — bedroom temperature alerts are off"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Min °C"
          inputMode="decimal"
          className="w-24 rounded-full px-4 py-2 text-[13px]"
          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
        />
        <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
          to
        </span>
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="Max °C"
          inputMode="decimal"
          className="w-24 rounded-full px-4 py-2 text-[13px]"
          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
        />
        <button
          onClick={save}
          disabled={busy}
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
