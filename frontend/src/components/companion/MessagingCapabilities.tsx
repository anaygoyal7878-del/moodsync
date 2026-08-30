"use client";

import { useEffect, useState } from "react";
import { Wrench, Check, Minus } from "lucide-react";

/**
 * What the bot can actually do for *this* account, right now.
 *
 * Reads the live tool surface from `/api/messaging/capabilities`, which
 * is built by the same `selectMessagingTools` the agent uses to decide
 * what to declare to the model — not a hardcoded marketing list. That
 * means this panel structurally cannot advertise something the agent
 * won't be able to do when you text it, which is the failure mode a
 * static feature list always eventually has.
 *
 * Unavailable abilities are shown greyed with the reason rather than
 * hidden: "you could have this if you connected a bridge" is useful,
 * and silently omitting it looks like the feature doesn't exist.
 */

interface Capabilities {
  tools: string[];
}

/** Tool name → what it means in a sentence a person would say. */
const TOOL_COPY: Record<string, string> = {
  get_wearable_snapshot: "Tell you how you're doing — readiness, sleep, recovery, heart rate",
  get_nutrition_guidance: "Answer general nutrition questions, grounded in your caffeine and energy data",
  log_caffeine_intake: "Log a coffee when you mention having one",
  remember_fact: "Remember a preference for future conversations",
};

export function MessagingCapabilities() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    fetch("/api/messaging/capabilities", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Capabilities>) : null))
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);

  if (!capabilities) return null;

  const available = new Set(capabilities.tools);
  const allTools = Object.keys(TOOL_COPY);

  return (
    <section className="glass-surface rounded-2xl p-5" style={{ background: "var(--lux-bg-card)" }}>
      <div className="flex items-center gap-2">
        <Wrench size={16} aria-hidden style={{ color: "var(--lux-sage)" }} />
        <h2 className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          What it can do for you
        </h2>
      </div>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--lux-muted)" }}>
        Built from what your account actually has connected — not a feature list. Anything greyed out
        genuinely isn’t available to the bot right now.
      </p>

      <ul className="space-y-2">
        {allTools.map((tool) => {
          const on = available.has(tool);
          return (
            <li key={tool} className="flex items-start gap-2" style={{ opacity: on ? 1 : 0.45 }}>
              {on ? (
                <Check size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--lux-sage)" }} />
              ) : (
                <Minus size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--lux-muted)" }} />
              )}
              <span className="text-sm" style={{ color: on ? "var(--lux-ink)" : "var(--lux-muted)" }}>
                {TOOL_COPY[tool]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
