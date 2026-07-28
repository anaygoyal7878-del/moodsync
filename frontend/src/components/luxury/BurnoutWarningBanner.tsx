"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface BurnoutCheckResponse {
  risk: { title: string; body: string } | null;
}

/** Fetched once per page load (not polled) — burnout risk is computed
 * from the day's sleep/recovery/HR/calendar signals, which don't
 * meaningfully change minute-to-minute the way Live Energy does. See
 * ai/src/proactiveNotifications.ts's checkBurnoutRisk for the
 * conjunction logic (poor sleep AND low recovery AND at least one of
 * elevated heart rate or an overloaded calendar). */
export function BurnoutWarningBanner() {
  const [risk, setRisk] = useState<{ title: string; body: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/burnout-check", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<BurnoutCheckResponse>) : null))
      .then((data) => {
        if (!cancelled && data) setRisk(data.risk);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!risk || dismissed) return null;

  return (
    <section
      className="lux-stagger-1 flex items-start gap-3 rounded-[20px] p-4"
      style={{ background: "rgba(217,168,200,0.12)", border: "1px solid var(--lux-rose)" }}
    >
      <AlertTriangle size={18} style={{ color: "var(--lux-rose)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          {risk.title}
        </p>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--lux-muted)" }}>
          {risk.body}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1"
        style={{ color: "var(--lux-muted)" }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
