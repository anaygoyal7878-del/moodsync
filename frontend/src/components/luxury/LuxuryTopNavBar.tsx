"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useViewMode } from "@/components/shell/ViewModeContext";

function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Ported from the Superdesign TopNavBar component. `userName`/
 * `userInitial` come from the real /api/me displayName — the draft's
 * defaults ("Sarah"/"S") never render here. The bell has a real
 * destination (/dashboard/notifications, an existing page) rather than
 * the draft's inert @click emit. */
export function LuxuryTopNavBar({ userName }: { userName: string }) {
  const initial = userName.trim().charAt(0).toUpperCase() || "?";
  const greeting = timeOfDayGreeting(new Date().getHours());
  const { mode } = useViewMode();
  const visibilityClass = mode === "mobile" ? "block" : mode === "web" ? "hidden" : "sm:hidden";

  return (
    <header
      className={`shrink-0 sticky top-0 z-40 pt-6 ${visibilityClass}`}
      style={{ background: "var(--lux-bg-ground)", borderBottom: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-center justify-between px-5 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="font-luxury-display flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
            style={{
              background: "var(--lux-bg-card-2)",
              border: "1.5px solid rgba(95,184,120,0.4)",
              color: "var(--lux-sage)",
            }}
          >
            {initial}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px]" style={{ color: "var(--lux-muted)" }} suppressHydrationWarning>
              {greeting}
            </span>
            <span className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {userName}
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "var(--lux-bg-card-2)" }}
          aria-label="Notifications"
        >
          <Bell size={18} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
