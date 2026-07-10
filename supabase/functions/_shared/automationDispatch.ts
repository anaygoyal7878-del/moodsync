import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { MoodoClient } from "./providers/moodo.ts";
import { HomeAssistantClient } from "./providers/homeAssistant.ts";
import { GoveeClient } from "./providers/govee.ts";
import { SwitchBotClient } from "./providers/switchbot.ts";
import {
  loadGoveeCredentials,
  loadHomeAssistantCredentials,
  loadMoodoCredentials,
  loadSwitchBotCredentials,
} from "./deviceCredentials.ts";

export type MoodLabel =
  | "relaxed"
  | "focused"
  | "high_stress"
  | "fatigued"
  | "sleeping"
  | "recovering"
  | "energized";

export type TriggerSource = "mood_engine" | "manual_override" | "schedule";

export interface DispatchRequest {
  userId: string;
  triggerSource: TriggerSource;
  moodStateId?: string;
  mood?: MoodLabel;
  /** Manual override callers can force a specific device + parameters. */
  overrideDeviceId?: string;
  overrideFragranceProfileId?: string;
  overrideIntensity?: number;
  overrideRuntimeMinutes?: number;
}

export interface DispatchResult {
  outcome: "dispatched" | "skipped_cooldown" | "skipped_user_override" | "failed";
  deviceId?: string;
  failureReason?: string;
}

interface AutomationRuleRow {
  fragrance_profile_id: string | null;
  intensity: number;
  runtime_minutes: number;
  cooldown_minutes: number;
  enabled: boolean;
}

interface DeviceRow {
  id: string;
  provider: "moodo" | "pura" | "home_assistant" | "homekit" | "govee" | "switchbot";
  external_id: string;
  capabilities: { power: boolean; intensity: boolean; scent_selection: boolean };
  is_online: boolean;
  provider_metadata: Record<string, unknown>;
}

/**
 * Core automation dispatch: resolves the rule for a mood (or an explicit
 * manual override), enforces cooldown, calls the right provider client, and
 * records the outcome in `automation_history`. Shared by the HTTP
 * `diffuser-dispatch` function and the internal call from `mood-ingest`.
 */
export async function dispatchDiffuserCommand(
  admin: SupabaseClient,
  req: DispatchRequest,
): Promise<DispatchResult> {
  const isManual = req.triggerSource === "manual_override";

  let fragranceProfileId = req.overrideFragranceProfileId ?? null;
  let intensity = req.overrideIntensity ?? 0.5;
  let runtimeMinutes = req.overrideRuntimeMinutes ?? 15;
  let cooldownMinutes = 0;

  if (!isManual) {
    if (!req.mood) {
      throw new Error("mood is required for non-manual dispatch");
    }
    const { data: rule, error: ruleError } = await admin
      .from("automation_rules")
      .select("fragrance_profile_id, intensity, runtime_minutes, cooldown_minutes, enabled")
      .eq("user_id", req.userId)
      .eq("mood", req.mood)
      .maybeSingle<AutomationRuleRow>();

    if (ruleError) throw ruleError;
    if (!rule || !rule.enabled) {
      return { outcome: "skipped_user_override" };
    }

    fragranceProfileId = rule.fragrance_profile_id;
    intensity = rule.intensity;
    runtimeMinutes = rule.runtime_minutes;
    cooldownMinutes = rule.cooldown_minutes;

    const cooldownBlocked = await isWithinCooldown(admin, req.userId, req.mood, cooldownMinutes);
    if (cooldownBlocked) {
      await recordHistory(admin, req, {
        outcome: "skipped_cooldown",
        fragranceProfileId,
        intensity,
        runtimeMinutes,
      });
      return { outcome: "skipped_cooldown" };
    }
  }

  const device = await selectTargetDevice(admin, req.userId, req.overrideDeviceId);
  if (!device) {
    await recordHistory(admin, req, {
      outcome: "failed",
      fragranceProfileId,
      intensity,
      runtimeMinutes,
      failureReason: "No online device available for this user",
    });
    return { outcome: "failed", failureReason: "No online device available" };
  }

  try {
    await sendToProvider(admin, req.userId, device, intensity);
    await recordHistory(admin, req, {
      outcome: "dispatched",
      deviceId: device.id,
      fragranceProfileId,
      intensity,
      runtimeMinutes,
    });
    return { outcome: "dispatched", deviceId: device.id };
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await recordHistory(admin, req, {
      outcome: "failed",
      deviceId: device.id,
      fragranceProfileId,
      intensity,
      runtimeMinutes,
      failureReason,
    });
    return { outcome: "failed", deviceId: device.id, failureReason };
  }
}

/** Powers a device off directly — used for manual "stop" actions from the app. */
export async function stopDiffuserDevice(
  admin: SupabaseClient,
  userId: string,
  deviceId: string,
): Promise<void> {
  const { data: device, error } = await admin
    .from("devices")
    .select("id, provider, external_id, capabilities, is_online, provider_metadata")
    .eq("user_id", userId)
    .eq("id", deviceId)
    .single<DeviceRow>();

  if (error || !device) {
    throw new Error(`Device ${deviceId} not found for this user`);
  }

  switch (device.provider) {
    case "moodo": {
      const creds = await loadMoodoCredentials(admin, userId);
      await new MoodoClient(creds.token, creds.apiBaseUrl).powerOff(Number(device.external_id));
      return;
    }
    case "pura":
    case "home_assistant": {
      const creds = await loadHomeAssistantCredentials(admin, userId);
      const domain = device.capabilities.intensity ? "humidifier" : "switch";
      await new HomeAssistantClient(creds.baseUrl, creds.longLivedToken).turnOff(device.external_id, domain);
      return;
    }
    case "homekit": {
      // Performed on-device by the app's HomeKitProvider; nothing to do server-side.
      return;
    }
    case "govee": {
      const [sku, deviceKey] = device.external_id.split("|");
      const creds = await loadGoveeCredentials(admin, userId);
      await new GoveeClient(creds.apiKey).setPower(sku, deviceKey, false);
      return;
    }
    case "switchbot": {
      const creds = await loadSwitchBotCredentials(admin, userId);
      await new SwitchBotClient(creds.token, creds.secret).turnOff(device.external_id);
      return;
    }
    default:
      throw new Error(`Unsupported provider: ${device.provider}`);
  }
}

async function isWithinCooldown(
  admin: SupabaseClient,
  userId: string,
  mood: MoodLabel,
  cooldownMinutes: number,
): Promise<boolean> {
  if (cooldownMinutes <= 0) return false;

  const { data, error } = await admin
    .from("automation_history")
    .select("started_at, mood_state_id, mood_states!inner(mood)")
    .eq("user_id", userId)
    .eq("outcome", "dispatched")
    .eq("mood_states.mood", mood)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ started_at: string }>();

  if (error || !data) return false;

  const elapsedMs = Date.now() - new Date(data.started_at).getTime();
  return elapsedMs < cooldownMinutes * 60_000;
}

async function selectTargetDevice(
  admin: SupabaseClient,
  userId: string,
  overrideDeviceId?: string,
): Promise<DeviceRow | null> {
  let query = admin
    .from("devices")
    .select("id, provider, external_id, capabilities, is_online, provider_metadata")
    .eq("user_id", userId)
    .eq("is_online", true);

  if (overrideDeviceId) {
    query = query.eq("id", overrideDeviceId);
  }

  const { data, error } = await query.limit(1).maybeSingle<DeviceRow>();
  if (error) throw error;
  return data ?? null;
}

async function sendToProvider(
  admin: SupabaseClient,
  userId: string,
  device: DeviceRow,
  intensity: number,
): Promise<void> {
  const fanVolume = Math.round(intensity * 100);

  switch (device.provider) {
    case "moodo": {
      const creds = await loadMoodoCredentials(admin, userId);
      const client = new MoodoClient(creds.token, creds.apiBaseUrl);
      const deviceKey = Number(device.external_id);
      await client.powerOn(deviceKey);
      if (device.capabilities.intensity) {
        await client.setIntensity(deviceKey, fanVolume);
      }
      return;
    }
    case "pura":
    case "home_assistant": {
      // Pura has no verified direct API; it (and any other HA-exposed
      // diffuser, e.g. Rituals Perfume Genie) is controlled through the
      // user's own Home Assistant instance instead.
      const creds = await loadHomeAssistantCredentials(admin, userId);
      const client = new HomeAssistantClient(creds.baseUrl, creds.longLivedToken);
      const domain = device.capabilities.intensity ? "humidifier" : "switch";
      await client.turnOn(device.external_id, domain);
      if (device.capabilities.intensity) {
        await client.setHumidifierIntensity(device.external_id, fanVolume);
      }
      return;
    }
    case "homekit": {
      // HomeKit accessory control (HMAccessory characteristic writes) can
      // only happen on-device via Apple's HomeKit framework — there is no
      // server-side HomeKit API. The Edge Function records the intent;
      // the iOS app's HomeKitProvider performs the actual characteristic
      // write and reports completion back via `mood-ingest`'s ack path.
      return;
    }
    case "govee": {
      // external_id is stored as "<sku>|<deviceId>" since Govee's control
      // API needs both fields together to address a device.
      const [sku, deviceId] = device.external_id.split("|");
      const creds = await loadGoveeCredentials(admin, userId);
      const client = new GoveeClient(creds.apiKey);
      await client.setPower(sku, deviceId, true);
      const intensityCapability = device.provider_metadata.intensityCapability as
        | { type: string; instance: string; parameters?: Record<string, unknown> }
        | undefined;
      if (device.capabilities.intensity && intensityCapability) {
        await client.setIntensity(sku, deviceId, intensityCapability, intensity);
      }
      return;
    }
    case "switchbot": {
      const creds = await loadSwitchBotCredentials(admin, userId);
      const client = new SwitchBotClient(creds.token, creds.secret);
      await client.turnOn(device.external_id);
      // SwitchBot's public API command set for Humidifier mist-level
      // control isn't consistently documented across firmware revisions,
      // so intensity is left to the device's own onboard default/last-used
      // level rather than risking an unverified command payload.
      return;
    }
    default:
      throw new Error(`Unsupported provider: ${device.provider}`);
  }
}

async function recordHistory(
  admin: SupabaseClient,
  req: DispatchRequest,
  fields: {
    outcome: DispatchResult["outcome"];
    deviceId?: string;
    fragranceProfileId?: string | null;
    intensity?: number;
    runtimeMinutes?: number;
    failureReason?: string;
  },
): Promise<void> {
  await admin.from("automation_history").insert({
    user_id: req.userId,
    device_id: fields.deviceId ?? req.overrideDeviceId ?? null,
    mood_state_id: req.moodStateId ?? null,
    fragrance_profile_id: fields.fragranceProfileId ?? null,
    intensity: fields.intensity ?? null,
    runtime_minutes: fields.runtimeMinutes ?? null,
    trigger_source: req.triggerSource,
    outcome: fields.outcome,
    failure_reason: fields.failureReason ?? null,
  });
}
