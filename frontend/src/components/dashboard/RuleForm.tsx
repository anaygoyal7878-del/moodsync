"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CollapsibleSection } from "@/components/dashboard/automation/CollapsibleSection";
import { ConditionRow, type ConditionDraft } from "@/components/dashboard/automation/ConditionRow";
import { CONDITION_FIELDS, OPERATOR_LABELS } from "@/lib/conditionFields";
import { KELVIN_MIN, KELVIN_MAX, kelvinToMirek, mirekToKelvin, formatKelvin } from "@/lib/colorTemperature";
import { COOLDOWN_PRESETS, formatCooldown, PRIORITY_TIERS, priorityTierFor, formatPriority } from "@/lib/ruleFormPresets";
import { ACTION_TYPES, TEMPLATES, type ActionType } from "@/lib/ruleTemplates";
import type { DeviceSummary } from "@/lib/types";
import type { BiometricField, WellnessField } from "@moodsync/shared";

function newConditionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

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
  const searchParams = useSearchParams();
  // Lets QuickActions.tsx (the dashboard home's one-tap shortcuts) deep-link
  // straight into a pre-filled form via `?template=<id>` instead of
  // guessing at a device and submitting blind — see ruleTemplates.ts's
  // doc comment for why a silent submit isn't honest here (Hue actions
  // need a real deviceId this page doesn't know without the user picking
  // one). Read once, directly in render (not an effect calling setState,
  // which would trigger an avoidable extra render) — every field below
  // seeds its own initial state from this same lookup.
  const deepLinkedTemplate = TEMPLATES.find((t) => t.id === searchParams.get("template"));

  const [name, setName] = useState<string>(deepLinkedTemplate?.name ?? "");
  const [conditions, setConditions] = useState<ConditionDraft[]>([
    {
      id: newConditionId(),
      field: (deepLinkedTemplate?.field ?? "recoveryScore") as BiometricField | WellnessField,
      operator: deepLinkedTemplate?.operator ?? "lt",
      value: Number(deepLinkedTemplate?.value ?? "50"),
    },
  ]);
  const [actionType, setActionType] = useState<ActionType>(deepLinkedTemplate?.actionType ?? "hue.set_brightness");
  const [deviceId, setDeviceId] = useState(devices[0]?.externalDeviceId ?? "");
  const [sceneId, setSceneId] = useState("");
  const [brightness, setBrightness] = useState<number>(
    Number(deepLinkedTemplate && "brightness" in deepLinkedTemplate ? deepLinkedTemplate.brightness : "40"),
  );
  const [kelvin, setKelvin] = useState<number>(
    mirekToKelvin(Number(deepLinkedTemplate && "mirek" in deepLinkedTemplate ? deepLinkedTemplate.mirek : "370")),
  );
  const [playlistUri, setPlaylistUri] = useState("");
  const [sceneName, setSceneName] = useState<string>(
    deepLinkedTemplate && "sceneName" in deepLinkedTemplate ? deepLinkedTemplate.sceneName : "",
  );
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(Number(deepLinkedTemplate?.cooldownMinutes ?? "30"));
  const [customCooldown, setCustomCooldown] = useState(
    !COOLDOWN_PRESETS.some((p) => p.minutes === Number(deepLinkedTemplate?.cooldownMinutes ?? "30")),
  );
  const [priority, setPriority] = useState<number>(Number(deepLinkedTemplate?.priority ?? "50"));
  const [timeWindowEnabled, setTimeWindowEnabled] = useState(deepLinkedTemplate ? deepLinkedTemplate.timeWindow !== null : false);
  const [windowStart, setWindowStart] = useState<string>(deepLinkedTemplate?.timeWindow?.start ?? "09:00");
  const [windowEnd, setWindowEnd] = useState<string>(deepLinkedTemplate?.timeWindow?.end ?? "17:00");
  // "Arrival"/"Departure" trigger — see docs/GEOFENCING_ARCHITECTURE.md.
  // Requires the iOS companion app's location access; the rule still
  // fires from the dashboard's perspective the same way any other rule
  // does, just triggered by a POST /api/location-events push instead of
  // a biometric reading.
  const [locationTriggerEnabled, setLocationTriggerEnabled] = useState(false);
  const [locationTrigger, setLocationTrigger] = useState<"ARRIVED" | "DEPARTED">("ARRIVED");
  // Only meaningful once timeWindowEnabled or locationTriggerEnabled is
  // true — a schedule-only or geofence-only rule (Focus Mode, Sleep
  // Preparation, "when I get home") has no biometric condition at all,
  // matching the backend's "conditions.length > 0 OR timeWindow set OR
  // locationTrigger set" rule (see backend/src/api/routes/automationRules.ts).
  const [conditionEnabled, setConditionEnabled] = useState(deepLinkedTemplate ? deepLinkedTemplate.timeWindow === null : true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setName(template.name);
    setConditions([{ id: newConditionId(), field: template.field, operator: template.operator, value: Number(template.value) }]);
    setActionType(template.actionType);
    if ("brightness" in template) setBrightness(Number(template.brightness));
    if ("mirek" in template) setKelvin(mirekToKelvin(Number(template.mirek)));
    if ("sceneName" in template) setSceneName(template.sceneName);
    setCooldownMinutes(Number(template.cooldownMinutes));
    setCustomCooldown(!COOLDOWN_PRESETS.some((p) => p.minutes === Number(template.cooldownMinutes)));
    setPriority(Number(template.priority));
    setTimeWindowEnabled(template.timeWindow !== null);
    setConditionEnabled(template.timeWindow === null); // schedule-only templates drop the trivial placeholder condition
    if (template.timeWindow) {
      setWindowStart(template.timeWindow.start);
      setWindowEnd(template.timeWindow.end);
    }
  }

  function updateCondition(id: string, next: ConditionDraft) {
    setConditions((prev) => prev.map((c) => (c.id === id ? next : c)));
  }

  function addCondition() {
    setConditions((prev) => [...prev, { id: newConditionId(), field: "heartRate", operator: "gt", value: 100 }]);
  }

  function removeCondition(id: string) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  }

  const actionProvider = ACTION_TYPES.find((a) => a.value === actionType)?.provider ?? "hue";
  const needsDevice = actionType === "hue.set_brightness" || actionType === "hue.set_color_temperature";
  const disabledForMissingConnection = needsDevice ? devices.length === 0 : actionType === "spotify.play_playlist" && !spotifyConnected;

  function buildActionParams(): Record<string, unknown> {
    switch (actionType) {
      case "hue.set_scene":
        return { sceneId };
      case "hue.set_brightness":
        return { deviceId, brightness };
      case "hue.set_color_temperature":
        return { deviceId, mirek: kelvinToMirek(kelvin) };
      case "spotify.play_playlist":
        return { playlistUri };
      case "homekit.activate_scene":
        return { sceneName };
    }
  }

  function actionSummary(): string {
    switch (actionType) {
      case "hue.set_scene":
        return sceneId ? `Activate Hue scene "${sceneId}"` : "Activate a Hue scene";
      case "hue.set_brightness":
        return `Set brightness to ${brightness}%`;
      case "hue.set_color_temperature":
        return `Set color to ${formatKelvin(kelvin)}`;
      case "spotify.play_playlist":
        return playlistUri ? "Play your Spotify playlist" : "Play a Spotify playlist";
      case "homekit.activate_scene":
        return sceneName ? `Activate HomeKit scene "${sceneName}"` : "Activate a HomeKit scene";
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
        conditions: conditionEnabled ? conditions.map(({ field, operator, value }) => ({ field, operator, value })) : [],
        actions: [{ type: actionType, provider: actionProvider, params: buildActionParams() }],
        cooldownMinutes,
        priority,
        ...(timeWindowEnabled ? { timeWindow: { start: windowStart, end: windowEnd } } : {}),
        ...(locationTriggerEnabled ? { locationTrigger } : {}),
        notificationsEnabled,
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

  // Readable "WHEN … AND … THEN …" preview clauses, built from the same
  // state the submit payload uses — never a separate description a user
  // could type that drifts from what the rule actually does.
  const whenClauses: string[] = [];
  if (conditionEnabled) {
    for (const c of conditions) {
      whenClauses.push(`${CONDITION_FIELDS[c.field].label} ${OPERATOR_LABELS[c.operator]} ${CONDITION_FIELDS[c.field].format(c.value)}`);
    }
  }
  if (timeWindowEnabled) whenClauses.push(`Time is between ${formatTime(windowStart)} and ${formatTime(windowEnd)}`);
  if (locationTriggerEnabled) whenClauses.push(locationTrigger === "ARRIVED" ? "You arrive home" : "You leave home");

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <span className="shrink-0">Start from a template</span>
        <Select
          className="w-auto"
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
        </Select>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          placeholder={'Rule name, e.g. "Wind down when recovery is low"'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        {/* Live readable summary — updates as every field below changes. */}
        {(whenClauses.length > 0 || true) && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line-strong bg-surface-raised px-4 py-3.5 text-sm">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <p className="leading-relaxed text-ink-secondary">
              <span className="font-semibold text-ink">WHEN</span>{" "}
              {whenClauses.length > 0 ? (
                whenClauses.map((clause, i) => (
                  <span key={i}>
                    {i > 0 && <span className="font-semibold text-ink"> AND </span>}
                    {clause}
                  </span>
                ))
              ) : (
                <span className="italic text-ink-muted">no trigger set</span>
              )}
              <br />
              <span className="font-semibold text-ink">THEN</span> {actionSummary()}
            </p>
          </div>
        )}

        <CollapsibleSection title="Trigger" subtitle="What starts this automation">
          <Switch
            checked={timeWindowEnabled}
            onCheckedChange={setTimeWindowEnabled}
            label="Only during a scheduled time window"
          />
          {timeWindowEnabled && (
            <div className="flex flex-wrap items-center gap-3 pl-1 text-sm text-ink-secondary">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Starts at</span>
                <Input type="time" className="w-auto" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Ends at</span>
                <Input type="time" className="w-auto" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
              </div>
              <span className="self-end pb-2.5 text-xs text-ink-muted">
                {formatTime(windowStart)} – {formatTime(windowEnd)}
              </span>
            </div>
          )}

          <Switch
            checked={locationTriggerEnabled}
            onCheckedChange={setLocationTriggerEnabled}
            label="Trigger on arrival or departure"
          />
          {locationTriggerEnabled && (
            <div className="flex flex-wrap items-center gap-2 pl-1 text-sm text-ink-secondary">
              <span>When you</span>
              <Select
                className="w-auto"
                value={locationTrigger}
                onChange={(e) => setLocationTrigger(e.target.value as "ARRIVED" | "DEPARTED")}
              >
                <option value="ARRIVED">arrive home</option>
                <option value="DEPARTED">leave home</option>
              </Select>
              <span className="text-xs text-ink-muted">
                requires setting &quot;home&quot; once in the MoodSync companion iOS app
              </span>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Conditions" subtitle="Biometric or wellness thresholds that must also be true">
          {(timeWindowEnabled || locationTriggerEnabled) && (
            <Switch
              checked={conditionEnabled}
              onCheckedChange={setConditionEnabled}
              label="Also require a biometric condition"
            />
          )}
          {conditionEnabled && (
            <div className="flex flex-col gap-3">
              {conditions.map((c) => (
                <ConditionRow
                  key={c.id}
                  condition={c}
                  onChange={(next) => updateCondition(c.id, next)}
                  onRemove={conditions.length > 1 ? () => removeCondition(c.id) : undefined}
                />
              ))}
              <Button type="button" variant="ghost" className="self-start" onClick={addCondition}>
                + Add another condition (AND)
              </Button>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Actions" subtitle="What happens when the trigger fires">
          <Select className="w-auto" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
            {ACTION_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>

          {(actionType === "hue.set_brightness" || actionType === "hue.set_color_temperature" || actionType === "hue.set_scene") && (
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Lighting</p>

              {actionType === "hue.set_scene" && (
                <Input placeholder="Scene ID" value={sceneId} onChange={(e) => setSceneId(e.target.value)} required />
              )}

              {(actionType === "hue.set_brightness" || actionType === "hue.set_color_temperature") &&
                (devices.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Light</span>
                    <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                      {devices.map((d) => (
                        <option key={d.id} value={d.externalDeviceId}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <span className="text-xs text-ink-muted">Connect Hue and sync devices first</span>
                ))}

              {actionType === "hue.set_brightness" && (
                <LabeledSlider
                  label="Brightness"
                  value={brightness}
                  min={1}
                  max={100}
                  onChange={setBrightness}
                  formatValue={(v) => `${v}%`}
                />
              )}

              {actionType === "hue.set_color_temperature" && (
                <LabeledSlider
                  label="Color Temperature"
                  value={kelvin}
                  min={KELVIN_MIN}
                  max={KELVIN_MAX}
                  step={50}
                  onChange={setKelvin}
                  formatValue={formatKelvin}
                  segments={["Very Warm", "Warm", "Neutral", "Cool", "Daylight"]}
                  helpText="Turns the light on at this color temperature — separate from brightness."
                />
              )}
            </div>
          )}

          {actionType === "spotify.play_playlist" && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Music</p>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Provider</span>
                <Select value="spotify" disabled>
                  <option value="spotify">Spotify</option>
                </Select>
              </div>
              {spotifyConnected ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">Playlist URI</span>
                  <Input
                    placeholder="spotify:playlist:..."
                    value={playlistUri}
                    onChange={(e) => setPlaylistUri(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <span className="text-xs text-ink-muted">Connect Spotify first</span>
              )}
              <p className="text-xs text-ink-muted">
                Requires Spotify Premium and an already-active Spotify session on some device — playback can&apos;t be
                started remotely on a free account or when nothing is open.
              </p>
            </div>
          )}

          {actionType === "homekit.activate_scene" && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">HomeKit</p>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Scene name</span>
                <Input
                  placeholder='e.g. "MoodSync Relax"'
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-ink-muted">
                Must exactly match a scene you&apos;ve already created in Apple&apos;s Home app — MoodSync can only
                activate existing scenes, not create or control individual accessories. Runs the next time you open the
                MoodSync companion app on your iPhone, not instantly.
              </p>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Notifications" subtitle="Whether firing this rule alerts you">
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={setNotificationsEnabled}
            label="Notify me when this rule fires"
          />
        </CollapsibleSection>

        <CollapsibleSection title="Advanced" subtitle="Cooldown and conflict priority" defaultOpen={false}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Cooldown</span>
              <span className="tabular text-sm font-semibold text-brand">{formatCooldown(cooldownMinutes)}</span>
            </div>
            <SegmentedControl
              value={customCooldown ? "custom" : String(cooldownMinutes)}
              onChange={(v) => {
                if (v === "custom") {
                  setCustomCooldown(true);
                  return;
                }
                setCustomCooldown(false);
                setCooldownMinutes(Number(v));
              }}
              options={[
                ...COOLDOWN_PRESETS.map((p) => ({ value: String(p.minutes), label: p.label })),
                { value: "custom", label: "Custom" },
              ]}
            />
            {customCooldown && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  className="w-24"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                />
                <span className="text-sm text-ink-muted">minutes</span>
              </div>
            )}
            <p className="text-xs text-ink-muted">Minimum time between two firings of this rule.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Priority</span>
              <span className="tabular text-sm font-semibold text-brand">{formatPriority(priority)}</span>
            </div>
            <SegmentedControl
              value={priorityTierFor(priority)}
              onChange={(tier) => setPriority(PRIORITY_TIERS.find((t) => t.tier === tier)!.value)}
              options={PRIORITY_TIERS.map((t) => ({ value: t.tier, label: t.label }))}
            />
            <p className="text-xs text-ink-muted">
              Higher-priority automations override lower-priority ones when two rules try to control the same device at
              once.
            </p>
          </div>
        </CollapsibleSection>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={submitting || disabledForMissingConnection} className="self-start">
          {submitting ? "Creating…" : "Create rule"}
        </Button>
      </form>
    </Card>
  );
}
