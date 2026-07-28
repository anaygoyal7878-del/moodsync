"use client";

import { useEffect, useRef, useState } from "react";
import { BatteryMedium, Coffee } from "lucide-react";

interface LiveEnergyResponse {
  energy: { value: number | null; basis: string; caffeineBoost: number };
}

/** Coffee/tea/energy-drink mg estimates from the USDA FoodData Central
 * and Mayo Clinic's published caffeine-content tables — approximate, a
 * "typical serving" mg, not a measurement of what the user actually
 * drank. The client converts a drink pick to this fixed mg estimate
 * before posting; the server only ever stores a comparable mg number
 * (see CaffeineLog's schema comment). */
const CAFFEINE_PRESETS = [
  { label: "Coffee", mg: 95, icon: "☕" },
  { label: "Espresso", mg: 63, icon: "☕" },
  { label: "Tea", mg: 47, icon: "🍵" },
  { label: "Energy drink", mg: 80, icon: "⚡" },
] as const;

const REFRESH_INTERVAL_MS = 60_000;

function batteryColor(value: number): string {
  if (value <= 20) return "var(--lux-rose)";
  if (value <= 50) return "#e0b34a";
  return "var(--lux-sage)";
}

/** "Battery"-style live composite — distinct from the Overall Wellness
 * score shown in the hero card above it. Polls every minute rather than
 * on a websocket/push channel since the underlying inputs (biometric
 * sync, caffeine logs) only change a few times an hour at most — a
 * minute-level poll is "live" enough for a felt-energy indicator
 * without adding real-time infrastructure for a number that rarely
 * moves faster than that. */
export function LiveEnergyMeter() {
  const [energy, setEnergy] = useState<LiveEnergyResponse["energy"] | null>(null);
  const [showLogger, setShowLogger] = useState(false);
  const [logging, setLogging] = useState(false);

  const cancelledRef = useRef(false);

  function fetchEnergy() {
    fetch("/api/energy/live", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<LiveEnergyResponse>) : null))
      .then((data) => {
        if (!cancelledRef.current && data) setEnergy(data.energy);
      })
      .catch(() => {});
  }

  useEffect(() => {
    cancelledRef.current = false;
    fetchEnergy();
    const interval = setInterval(fetchEnergy, REFRESH_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, []);

  function logCaffeine(mg: number) {
    setLogging(true);
    fetch("/api/caffeine-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mg }),
    })
      .then(() => fetchEnergy())
      .finally(() => {
        setLogging(false);
        setShowLogger(false);
      });
  }

  const value = energy?.value ?? null;
  const color = value === null ? "var(--lux-muted)" : batteryColor(value);

  return (
    <section
      className="rounded-[24px] p-5"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BatteryMedium size={18} style={{ color }} aria-hidden="true" />
          <h2 className="font-luxury-display text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            Energy
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowLogger((v) => !v)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
        >
          <Coffee size={12} aria-hidden="true" />
          Log caffeine
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-luxury-display tabular text-[32px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          {value === null ? "—" : `${value}%`}
        </span>
        {energy && energy.caffeineBoost > 0 && (
          <span className="text-[12px]" style={{ color: "var(--lux-sage)" }}>
            +{energy.caffeineBoost} from caffeine
          </span>
        )}
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--lux-bg-card-2)" }}
        role="progressbar"
        aria-valuenow={value ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value ?? 0}%`, background: color }}
        />
      </div>

      {value === null && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--lux-muted)" }}>
          Connect a wearable to see your live energy level.
        </p>
      )}

      {showLogger && (
        <div className="mt-3 flex flex-wrap gap-2">
          {CAFFEINE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={logging}
              onClick={() => logCaffeine(preset.mg)}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
            >
              {preset.icon} {preset.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
