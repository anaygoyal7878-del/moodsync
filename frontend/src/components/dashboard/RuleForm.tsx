"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { DeviceSummary } from "@/lib/types";

const BIOMETRIC_FIELDS = [
  "heartRate",
  "restingHeartRate",
  "sleepScore",
  "recoveryScore",
  "stressLevel",
  "activityLevel",
  "steps",
  "calories",
] as const;

const OPERATORS = [
  { value: "lt", label: "is below" },
  { value: "lte", label: "is at or below" },
  { value: "gt", label: "is above" },
  { value: "gte", label: "is at or above" },
  { value: "eq", label: "equals" },
] as const;

// notification.* is modeled in the schema (Milestone 4) but has no
// dedicated executor — every dispatch outcome now generates a real
// notification automatically instead (see ai/src/dispatch.ts /
// ai/src/notificationExecutor.ts), so surfacing a notification-only
// action type still isn't useful here.
const ACTION_TYPES = [
  { value: "hue.set_scene", label: "Activate a Hue scene", provider: "hue" },
  { value: "hue.set_brightness", label: "Set a light's brightness", provider: "hue" },
  { value: "hue.set_color_temperature", label: "Set a light's color temperature", provider: "hue" },
  { value: "spotify.play_playlist", label: "Play a Spotify playlist", provider: "spotify" },
] as const;

type ActionType = (typeof ACTION_TYPES)[number]["value"];

/** Six of the eight Decision Engine automation scenarios (see
 * docs/DECISION_ENGINE_ARCHITECTURE.md) as selectable starting points —
 * still fully user-editable after applying, not hardcoded system rules.
 * Sleep Detection's lock/security check and Travel/away-mode are
 * deliberately absent: no smart lock, security, or location integration
 * exists in this codebase (see docs/DECISION_ENGINE_ROADMAP.md).
 *
 * Each template uses a single condition to fit this form's current
 * single-condition builder, even where the underlying rule shape
 * (`RuleCondition[]`) supports ANDing several — a real simplification,
 * not a claim that e.g. "Elevated Stress" checks HRV too. */
const TEMPLATES = [
  {
    id: "elevated-stress",
    label: "Elevated Stress — dim & calm when heart rate spikes",
    name: "Elevated Stress",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "95",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "450",
    cooldownMinutes: "30",
    priority: "70",
    timeWindow: null as { start: string; end: string } | null,
  },
  {
    id: "focus-mode",
    label: "Focus Mode — bright & cool during work hours",
    name: "Focus Mode",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "250",
    cooldownMinutes: "60",
    priority: "50",
    timeWindow: { start: "09:00", end: "17:00" },
  },
  {
    id: "sleep-preparation",
    label: "Sleep Preparation — dim & warm before bed",
    name: "Sleep Preparation",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_color_temperature" as ActionType,
    mirek: "454",
    cooldownMinutes: "1440",
    priority: "80",
    timeWindow: { start: "21:30", end: "22:30" },
  },
  {
    id: "wake-up",
    label: "Wake Up — gentle brightness ramp in the morning",
    name: "Wake Up",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "0",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "20",
    cooldownMinutes: "1440",
    priority: "60",
    timeWindow: { start: "06:00", end: "08:00" },
  },
  {
    id: "workout",
    label: "Workout — energizing scene when heart rate is high",
    name: "Workout",
    field: "heartRate" as const,
    operator: "gt" as const,
    value: "120",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "100",
    cooldownMinutes: "20",
    priority: "70",
    timeWindow: null,
  },
  {
    id: "recovery",
    label: "Recovery — lower-intensity scene after activity",
    name: "Recovery",
    field: "activityLevel" as const,
    operator: "gte" as const,
    value: "60",
    actionType: "hue.set_brightness" as ActionType,
    brightness: "35",
    cooldownMinutes: "60",
    priority: "60",
    timeWindow: null,
  },
] as const;

const selectClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-line-strong focus:outline-none";

export function RuleForm({
  devices,
  spotifyConnected,
  onCreated,
}: {
  devices: DeviceSummary[];
  spotifyConnected: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [field, setField] = useState<(typeof BIOMETRIC_FIELDS)[number]>("recoveryScore");
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]["value"]>("lt");
  const [value, setValue] = useState("50");
  const [actionType, setActionType] = useState<ActionType>("hue.set_brightness");
  const [deviceId, setDeviceId] = useState(devices[0]?.externalDeviceId ?? "");
  const [sceneId, setSceneId] = useState("");
  const [brightness, setBrightness] = useState("40");
  const [mirek, setMirek] = useState("370");
  const [playlistUri, setPlaylistUri] = useState("");
  const [cooldownMinutes, setCooldownMinutes] = useState("30");
  const [priority, setPriority] = useState("50");
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  // Only meaningful once timeWindowEnabled is true — a schedule-only rule
  // (Focus Mode, Sleep Preparation) has no biometric condition at all,
  // matching the backend's "conditions.length > 0 OR timeWindow set" rule
  // (see backend/src/api/routes/automationRules.ts).
  const [conditionEnabled, setConditionEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setName(template.name);
    setField(template.field);
    setOperator(template.operator);
    setValue(template.value);
    setActionType(template.actionType);
    if ("brightness" in template) setBrightness(template.brightness);
    if ("mirek" in template) setMirek(template.mirek);
    setCooldownMinutes(template.cooldownMinutes);
    setPriority(template.priority);
    setTimeWindowEnabled(template.timeWindow !== null);
    setConditionEnabled(template.timeWindow === null); // schedule-only templates drop the trivial placeholder condition
    if (template.timeWindow) {
      setWindowStart(template.timeWindow.start);
      setWindowEnd(template.timeWindow.end);
    }
  }

  const actionProvider = ACTION_TYPES.find((a) => a.value === actionType)?.provider ?? "hue";
  const needsDevice = actionType === "hue.set_brightness" || actionType === "hue.set_color_temperature";
  const disabledForMissingConnection = needsDevice ? devices.length === 0 : actionType === "spotify.play_playlist" && !spotifyConnected;

  function buildActionParams(): Record<string, unknown> {
    switch (actionType) {
      case "hue.set_scene":
        return { sceneId };
      case "hue.set_brightness":
        return { deviceId, brightness: Number(brightness) };
      case "hue.set_color_temperature":
        return { deviceId, mirek: Number(mirek) };
      case "spotify.play_playlist":
        return { playlistUri };
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/automation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        enabled: true,
        conditions: conditionEnabled ? [{ field, operator, value: Number(value) }] : [],
        actions: [{ type: actionType, provider: actionProvider, params: buildActionParams() }],
        cooldownMinutes: Number(cooldownMinutes),
        priority: Number(priority),
        ...(timeWindowEnabled ? { timeWindow: { start: windowStart, end: windowEnd } } : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message =
        typeof data.error === "string"
          ? data.error
          : ((Object.values(data.error?.fieldErrors ?? {}).flat()[0] as string | undefined) ??
            "Couldn't create this rule.");
      setError(message);
      setSubmitting(false);
      return;
    }

    setName("");
    setSubmitting(false);
    router.refresh();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <span>Start from a template</span>
        <select
          className={selectClass}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTemplate(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Choose a template…
          </option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <Input
        placeholder={'Rule name, e.g. "Wind down when recovery is low"'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <label className="flex items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" checked={timeWindowEnabled} onChange={(e) => setTimeWindowEnabled(e.target.checked)} />
        Only during a scheduled time window
      </label>
      {timeWindowEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          <span>Between</span>
          <input type="time" className={selectClass} value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          <span>and</span>
          <input type="time" className={selectClass} value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          <label className="ml-4 flex items-center gap-2">
            <input type="checkbox" checked={conditionEnabled} onChange={(e) => setConditionEnabled(e.target.checked)} />
            Also require a biometric condition
          </label>
        </div>
      )}

      {conditionEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          <span>When</span>
          <select className={selectClass} value={field} onChange={(e) => setField(e.target.value as typeof field)}>
            {BIOMETRIC_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select className={selectClass} value={operator} onChange={(e) => setOperator(e.target.value as typeof operator)}>
            {OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Input type="number" className="w-24" value={value} onChange={(e) => setValue(e.target.value)} required />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <span>Then</span>
        <select
          className={selectClass}
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ActionType)}
        >
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {actionType === "hue.set_scene" && (
          <Input placeholder="Scene ID" value={sceneId} onChange={(e) => setSceneId(e.target.value)} required />
        )}

        {(actionType === "hue.set_brightness" || actionType === "hue.set_color_temperature") &&
          (devices.length > 0 ? (
            <select className={selectClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {devices.map((d) => (
                <option key={d.id} value={d.externalDeviceId}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-ink-muted">Connect Hue and sync devices first</span>
          ))}

        {actionType === "hue.set_brightness" && (
          <Input
            type="number"
            min={0}
            max={100}
            className="w-24"
            value={brightness}
            onChange={(e) => setBrightness(e.target.value)}
            required
          />
        )}

        {actionType === "hue.set_color_temperature" && (
          <Input type="number" className="w-24" value={mirek} onChange={(e) => setMirek(e.target.value)} required />
        )}

        {actionType === "spotify.play_playlist" &&
          (spotifyConnected ? (
            <Input
              placeholder="spotify:playlist:..."
              value={playlistUri}
              onChange={(e) => setPlaylistUri(e.target.value)}
              required
            />
          ) : (
            <span className="text-xs text-ink-muted">Connect Spotify first</span>
          ))}
      </div>

      {actionType === "spotify.play_playlist" && (
        <p className="text-xs text-ink-muted">
          Requires Spotify Premium and an already-active Spotify session on some device — playback can&apos;t be
          started remotely on a free account or when nothing is open.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <span>Cooldown</span>
        <Input
          type="number"
          min={0}
          max={1440}
          className="w-24"
          value={cooldownMinutes}
          onChange={(e) => setCooldownMinutes(e.target.value)}
        />
        <span>minutes</span>
        <span className="ml-4">Priority</span>
        <Input type="number" min={0} max={100} className="w-20" value={priority} onChange={(e) => setPriority(e.target.value)} />
        <span className="text-xs text-ink-muted">higher wins if two rules conflict</span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={submitting || disabledForMissingConnection} className="self-start">
        {submitting ? "Creating…" : "Create rule"}
      </Button>
    </form>
  );
}
