"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OctagonPause, Plus, Timer } from "lucide-react";

/** One-tap shortcuts on the dashboard home. "Start Focus" and "New rule"
 * are plain navigation. "Emergency Stop" is the one action that's
 * genuinely instant — it's the same real pause-all-automations call
 * PauseAutomationsButton.tsx already makes (POST
 * /api/preferences/automation-pause, 60 minutes), not a fabricated
 * capability. */

function CircleButton({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  luxury,
}: {
  icon: typeof Timer;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  luxury?: boolean;
}) {
  const inner = (
    <>
      <span
        className={
          luxury
            ? "flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-90"
            : "flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-brand transition-transform active:scale-90"
        }
        style={luxury ? { background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" } : undefined}
      >
        <Icon size={22} aria-hidden="true" />
      </span>
      <span
        className={luxury ? "text-xs font-medium" : "text-xs font-medium text-ink-secondary"}
        style={luxury ? { color: "var(--lux-ink)" } : undefined}
      >
        {label}
      </span>
    </>
  );

  const className = "flex shrink-0 flex-col items-center gap-1.5 disabled:opacity-40";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {inner}
    </button>
  );
}

export function QuickActions({ isPaused, luxury }: { isPaused: boolean; luxury?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggleEmergencyStop() {
    setPending(true);
    await fetch("/api/preferences/automation-pause", {
      method: isPaused ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: isPaused ? undefined : JSON.stringify({ minutes: 60 }),
    });
    router.refresh();
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2
        className={luxury ? "font-luxury-display text-[16px] font-semibold" : "text-sm font-semibold uppercase tracking-wide text-ink-muted"}
        style={luxury ? { color: "var(--lux-ink)" } : undefined}
      >
        Quick actions
      </h2>
      <div className="flex gap-5 overflow-x-auto pb-1">
        <CircleButton icon={Timer} label="Start Focus" href="/dashboard/focus" luxury={luxury} />
        <CircleButton icon={Plus} label="New rule" href="/dashboard/automation" luxury={luxury} />
        <CircleButton
          icon={OctagonPause}
          label={isPaused ? "Resume" : "Emergency Stop"}
          onClick={toggleEmergencyStop}
          disabled={pending}
          luxury={luxury}
        />
      </div>
    </section>
  );
}
