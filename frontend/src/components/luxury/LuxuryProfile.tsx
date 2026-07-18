"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ChevronRight, CheckCircle2 } from "lucide-react";
import { WEARABLE_LABELS, SMART_HOME_LABELS, PROVIDER_ICONS } from "@/lib/providerDisplay";
import type { ConnectionsResponse } from "@/lib/types";

interface MeData {
  email: string;
  displayName: string | null;
  createdAt: string;
}

/** Ported from the Superdesign User Profile draft. Four of the draft's
 * sections are dropped entirely rather than faked with placeholder
 * data — see the scoping conversation this port started from:
 * Quick Goals rings and Wellness Targets (no per-user goal-setting
 * feature exists), the Subscription card (no billing/Stripe
 * integration — MoodSync is free during beta, per the landing page's
 * real pricing copy), and the Achievements grid (no gamification
 * system exists). The avatar/name, Account Settings, Connected
 * Integrations, and Log Out are all real. */
export function LuxuryProfile({ me, connections }: { me: MeData; connections: ConnectionsResponse }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const name = me.displayName ?? me.email.split("@")[0];
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const allConnections = [
    ...connections.wearables.map((c) => ({ provider: c.provider, status: c.status, label: WEARABLE_LABELS[c.provider] ?? c.provider })),
    ...connections.smartHome.map((c) => ({ provider: c.provider, status: c.status, label: SMART_HOME_LABELS[c.provider] ?? c.provider })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="lux-stagger-1 flex flex-col items-center pt-2 pb-4">
        <div
          className="font-luxury-display mb-4 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold"
          style={{ background: "var(--lux-bg-card-2)", border: "3px solid var(--lux-sage)", color: "var(--lux-sage)" }}
        >
          {initial}
        </div>
        <h1 className="font-luxury-display text-center text-2xl font-semibold" style={{ color: "var(--lux-ink)" }}>
          {name}
        </h1>
        <div
          className="mt-1.5 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase"
          style={{
            background: "rgba(212,175,120,0.1)",
            border: "1px solid var(--lux-hairline-gold)",
            color: "var(--lux-gold)",
          }}
        >
          Beta member
        </div>
      </section>

      {/* Account Settings — real /api/me fields only; no profile-editing
       * feature exists yet, so rows are display-only (matching the
       * classic /dashboard/profile page's own documented limitation). */}
      <section className="lux-stagger-2 flex flex-col gap-3">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--lux-muted)" }}>
          Account
        </h2>
        <div className="overflow-hidden rounded-3xl" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
          <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--lux-hairline)" }}>
            <div className="flex flex-col">
              <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
                Full Name
              </span>
              <span className="text-[15px] font-medium" style={{ color: "var(--lux-ink)" }}>
                {me.displayName ?? "Not set"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex flex-col">
              <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
                Email
              </span>
              <span className="text-[15px] font-medium" style={{ color: "var(--lux-ink)" }}>
                {me.email}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Integrations — real /api/connections data, same
       * source ConnectionsSection.tsx uses on the classic Connections
       * page, restyled as a compact list. */}
      <section className="lux-stagger-3 flex flex-col gap-3">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--lux-muted)" }}>
          Integrations
        </h2>
        {allConnections.length === 0 ? (
          <div className="rounded-3xl p-4" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
            <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
              No integrations connected yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
            {allConnections.map((c, i) => {
              const Icon = PROVIDER_ICONS[c.provider];
              return (
                <div
                  key={c.provider}
                  className="flex items-center justify-between p-4"
                  style={i < allConnections.length - 1 ? { borderBottom: "1px solid var(--lux-hairline)" } : undefined}
                >
                  <div className="flex items-center gap-3">
                    {Icon && <Icon size={18} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />}
                    <span className="text-[14px]" style={{ color: "var(--lux-ink)" }}>
                      {c.label}
                    </span>
                  </div>
                  {c.status === "ACTIVE" ? (
                    <CheckCircle2 size={18} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="lux-stagger-4 mb-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 disabled:opacity-60"
        style={{ background: "rgba(255,122,122,0.08)", border: "1px solid rgba(255,122,122,0.15)" }}
      >
        <LogOut size={18} style={{ color: "#ff7a7a" }} aria-hidden="true" />
        <span className="text-[15px] font-semibold" style={{ color: "#ff7a7a" }}>
          {loggingOut ? "Logging out…" : "Log Out"}
        </span>
      </button>
    </div>
  );
}
