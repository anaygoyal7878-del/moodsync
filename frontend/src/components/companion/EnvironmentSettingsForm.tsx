"use client";

import { useState } from "react";

/**
 * Automation settings. The ordering is the product argument: the level
 * comes first and is explained in terms of what MoodSync will *do*,
 * because that's the decision that matters. Everything below it only
 * makes sense once that's chosen.
 */

type Level = "SUGGEST" | "ASSIST" | "AUTOMATE";

interface Settings {
  level: Level;
  lightingEnabled: boolean;
  musicEnabled: boolean;
  temperatureEnabled: boolean;
  sceneEnabled: boolean;
  scentEnabled: boolean;
  maxLightingDeltaPct: number;
  maxTemperatureDeltaC: number;
}

const LEVELS: Array<{ value: Level; title: string; body: string }> = [
  {
    value: "SUGGEST",
    title: "Suggest only",
    body: "MoodSync tells you what it noticed and what might help. Nothing changes unless you tap.",
  },
  {
    value: "ASSIST",
    title: "Assist",
    body: "MoodSync may make small, easily reversible changes on its own — lighting and music.",
  },
  {
    value: "AUTOMATE",
    title: "Automate",
    body: "MoodSync may also run Apple Home scenes you’ve already set up. Scenes still need their own toggle below.",
  },
];

const CHANNELS: Array<{ key: keyof Settings; label: string; help: string }> = [
  { key: "lightingEnabled", label: "Lighting", help: "Brightness and colour temperature on connected Hue lights." },
  { key: "musicEnabled", label: "Music", help: "Starting a playlist that matches your state." },
  {
    key: "temperatureEnabled",
    label: "Temperature",
    // Stated plainly rather than implied. MoodSync has no thermostat
    // write path at all — see docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
    help: "Recommendations only — MoodSync can read your room temperature but cannot change it.",
  },
  {
    key: "sceneEnabled",
    label: "Apple Home scenes",
    help: "Running a scene you already created. Off by default — this is the largest change MoodSync can make.",
  },
  {
    key: "scentEnabled",
    label: "Fragrance",
    // Advice only, like temperature — stated rather than implied.
    help: "Which Nature's Note cologne suits the moment, and where to apply it. Suggestions only — MoodSync obviously can't apply it for you.",
  },
];

export function EnvironmentSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function patch(update: Partial<Settings>) {
    const next = { ...settings, ...update };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/environment/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          How much should MoodSync do?
        </legend>
        <div className="mt-3 space-y-2">
          {LEVELS.map((level) => (
            <label
              key={level.value}
              className="flex cursor-pointer gap-3 rounded-xl p-4"
              style={{
                background: "var(--lux-bg-card-2)",
                border: settings.level === level.value ? "1px solid var(--lux-sage)" : "1px solid transparent",
              }}
            >
              <input
                type="radio"
                name="level"
                checked={settings.level === level.value}
                onChange={() => patch({ level: level.value })}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
                  {level.title}
                </span>
                <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
                  {level.body}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          What may it touch?
        </legend>
        <div className="mt-3 space-y-2">
          {CHANNELS.map((channel) => (
            <label
              key={channel.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl p-4"
              style={{ background: "var(--lux-bg-card-2)" }}
            >
              <input
                type="checkbox"
                checked={Boolean(settings[channel.key])}
                onChange={(e) => patch({ [channel.key]: e.target.checked } as Partial<Settings>)}
                className="mt-1"
                style={{ minWidth: 16, minHeight: 16 }}
              />
              <span>
                <span className="block text-sm" style={{ color: "var(--lux-ink)" }}>
                  {channel.label}
                </span>
                <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
                  {channel.help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          How big a change is allowed at once?
        </legend>
        <div className="mt-3 space-y-4">
          <label className="block rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
            <span className="flex items-baseline justify-between text-sm" style={{ color: "var(--lux-ink)" }}>
              Lighting
              <span style={{ color: "var(--lux-sage)" }}>{settings.maxLightingDeltaPct}%</span>
            </span>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={settings.maxLightingDeltaPct}
              onChange={(e) => patch({ maxLightingDeltaPct: Number(e.target.value) })}
              className="mt-2 w-full"
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--lux-muted)" }}>
              The most MoodSync will dim or brighten in one step.
            </span>
          </label>

          <label className="block rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
            <span className="flex items-baseline justify-between text-sm" style={{ color: "var(--lux-ink)" }}>
              Temperature
              <span style={{ color: "var(--lux-sage)" }}>{settings.maxTemperatureDeltaC.toFixed(1)}°C</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.5}
              value={settings.maxTemperatureDeltaC}
              onChange={(e) => patch({ maxTemperatureDeltaC: Number(e.target.value) })}
              className="mt-2 w-full"
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--lux-muted)" }}>
              The largest temperature change MoodSync will recommend.
            </span>
          </label>
        </div>
      </fieldset>

      <p aria-live="polite" className="text-xs" style={{ color: "var(--lux-muted)" }}>
        {saving ? "Saving…" : saved ? "Saved." : " "}
      </p>
    </div>
  );
}
