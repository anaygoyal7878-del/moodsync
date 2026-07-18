"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wind, Brain, Sunrise, Moon, Dumbbell, Cpu, OctagonPause, Plus } from "lucide-react";

/** One-tap shortcuts on the dashboard home. The five wellness actions
 * (Relaxation/Focus/Morning/Sleep/Workout) deep-link into RuleForm.tsx
 * pre-filled via `?template=<id>` — see lib/ruleTemplates.ts's doc
 * comment for why this navigates instead of silently creating a rule:
 * the Hue actions these templates use need a real deviceId from the
 * user's own connected lights, which a home-page tap can't know.
 * "Manage Devices" and "New rule" are plain navigation. "Emergency Stop"
 * is the one action that's genuinely instant — it's the same real
 * pause-all-automations call PauseAutomationsButton.tsx already makes
 * (POST /api/preferences/automation-pause, 60 minutes), not a fabricated
 * capability. */
const TEMPLATE_ACTIONS = [
  { templateId: "elevated-stress", label: "Relaxation", icon: Wind },
  { templateId: "focus-mode", label: "Focus", icon: Brain },
  { templateId: "wake-up", label: "Morning", icon: Sunrise },
  { templateId: "sleep-preparation", label: "Sleep", icon: Moon },
  { templateId: "workout", label: "Workout", icon: Dumbbell },
] as const;

function CircleButton({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: typeof Wind;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-brand transition-transform active:scale-90">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
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

export function QuickActions({ isPaused }: { isPaused: boolean }) {
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Quick actions</h2>
      <div className="flex gap-5 overflow-x-auto pb-1">
        {TEMPLATE_ACTIONS.map((action) => (
          <CircleButton
            key={action.templateId}
            icon={action.icon}
            label={action.label}
            href={`/dashboard/automation?template=${action.templateId}`}
          />
        ))}
        <CircleButton icon={Cpu} label="Devices" href="/dashboard/devices" />
        <CircleButton icon={Plus} label="New rule" href="/dashboard/automation" />
        <CircleButton
          icon={OctagonPause}
          label={isPaused ? "Resume" : "Emergency Stop"}
          onClick={toggleEmergencyStop}
          disabled={pending}
        />
      </div>
    </section>
  );
}
