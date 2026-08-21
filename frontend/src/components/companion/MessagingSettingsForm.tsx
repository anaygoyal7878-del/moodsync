"use client";

import { useState } from "react";

/**
 * When MoodSync may text you *first*.
 *
 * Everything on this screen governs unprompted messages only. Replying
 * to something you sent needs no permission and has no settings here —
 * the asymmetry is the point, and the copy says so, because "turn off
 * notifications" in most products quietly means "turn off the whole
 * thing" and people have learned to expect that.
 */

interface Settings {
  proactiveEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  dailyProactiveLimit: number;
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function MessagingSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function patch(update: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...update }));
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/messaging/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const quietHoursOn = settings.quietHoursStart !== null && settings.quietHoursEnd !== null;

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          May MoodSync text you first?
        </legend>
        <label
          className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl p-4"
          style={{ background: "var(--lux-bg-card-2)" }}
        >
          <input
            type="checkbox"
            checked={settings.proactiveEnabled}
            onChange={(e) => patch({ proactiveEnabled: e.target.checked })}
            className="mt-1"
            style={{ minWidth: 16, minHeight: 16 }}
          />
          <span>
            <span className="block text-sm" style={{ color: "var(--lux-ink)" }}>
              Send me unprompted messages
            </span>
            <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
              Only when something in your own data clears a conservative threshold — a burnout signal,
              a stress spike, a habit streak. Turning this off doesn’t stop MoodSync replying when you
              text it.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset disabled={!settings.proactiveEnabled} style={{ opacity: settings.proactiveEnabled ? 1 : 0.45 }}>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          Quiet hours
        </legend>
        <p className="mt-1 text-xs" style={{ color: "var(--lux-muted)" }}>
          MoodSync never texts first during these hours, in your own timezone.
        </p>

        <label
          className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl p-4"
          style={{ background: "var(--lux-bg-card-2)" }}
        >
          <input
            type="checkbox"
            checked={quietHoursOn}
            onChange={(e) =>
              patch(
                e.target.checked
                  ? { quietHoursStart: 22, quietHoursEnd: 7 }
                  : { quietHoursStart: null, quietHoursEnd: null },
              )
            }
            className="mt-1"
            style={{ minWidth: 16, minHeight: 16 }}
          />
          <span className="block text-sm" style={{ color: "var(--lux-ink)" }}>
            Keep quiet hours
          </span>
        </label>

        {quietHoursOn && (
          <div className="mt-2 flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
            <label className="flex-1 text-xs" style={{ color: "var(--lux-muted)" }}>
              From
              <select
                value={settings.quietHoursStart ?? 22}
                onChange={(e) => patch({ quietHoursStart: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg px-2 py-2 text-sm"
                style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)" }}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-xs" style={{ color: "var(--lux-muted)" }}>
              Until
              <select
                value={settings.quietHoursEnd ?? 7}
                onChange={(e) => patch({ quietHoursEnd: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg px-2 py-2 text-sm"
                style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)" }}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </fieldset>

      <fieldset disabled={!settings.proactiveEnabled} style={{ opacity: settings.proactiveEnabled ? 1 : 0.45 }}>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          How often, at most?
        </legend>
        <label className="mt-3 block rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
          <span className="flex items-baseline justify-between text-sm" style={{ color: "var(--lux-ink)" }}>
            Unprompted messages per day
            <span style={{ color: "var(--lux-sage)" }}>
              {settings.dailyProactiveLimit === 0 ? "none" : settings.dailyProactiveLimit}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={settings.dailyProactiveLimit}
            onChange={(e) => patch({ dailyProactiveLimit: Number(e.target.value) })}
            className="mt-2 w-full"
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--lux-muted)" }}>
            A hard ceiling, counted from midnight in your timezone. MoodSync usually sends far fewer —
            it only texts when a real signal clears its threshold.
          </span>
        </label>
      </fieldset>

      <p aria-live="polite" className="text-xs" style={{ color: "var(--lux-muted)" }}>
        {saving ? "Saving…" : saved ? "Saved." : " "}
      </p>
    </div>
  );
}
