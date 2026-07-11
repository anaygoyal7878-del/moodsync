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
// executor yet — see ai/src/dispatch.ts. Surfacing it would let a user
// create a rule that always fails, so it arrives alongside Milestone 9.
const ACTION_TYPES = [
  { value: "hue.set_scene", label: "Activate a Hue scene", provider: "hue" },
  { value: "hue.set_brightness", label: "Set a light's brightness", provider: "hue" },
  { value: "hue.set_color_temperature", label: "Set a light's color temperature", provider: "hue" },
  { value: "spotify.play_playlist", label: "Play a Spotify playlist", provider: "spotify" },
] as const;

type ActionType = (typeof ACTION_TYPES)[number]["value"];

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        conditions: [{ field, operator, value: Number(value) }],
        actions: [{ type: actionType, provider: actionProvider, params: buildActionParams() }],
        cooldownMinutes: Number(cooldownMinutes),
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
      <Input
        placeholder={'Rule name, e.g. "Wind down when recovery is low"'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

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
        <Input
          type="number"
          className="w-24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>

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
