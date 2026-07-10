import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getSupabaseAdmin, requireUser } from "../_shared/supabaseAdmin.ts";
import { MoodoClient } from "../_shared/providers/moodo.ts";
import { GoveeClient } from "../_shared/providers/govee.ts";
import { SwitchBotClient } from "../_shared/providers/switchbot.ts";
import {
  loadGoveeCredentials,
  loadMoodoCredentials,
  loadSwitchBotCredentials,
} from "../_shared/deviceCredentials.ts";

interface SyncBody {
  provider: "moodo" | "govee" | "switchbot";
}

const GOVEE_DIFFUSER_SKUS_HINT = ["aroma", "diffuser", "humidifier"];
const SWITCHBOT_HUMIDIFIER_TYPES = [
  "Humidifier",
  "Evaporative Humidifier",
  "Evaporative Humidifier (Auto-refill)",
];
const SWITCHBOT_PLUG_TYPES = ["Plug", "Plug Mini (US)", "Plug Mini (JP)"];

/**
 * Automatic device discovery: pulls the user's real device list from a
 * provider's cloud account and upserts it into `devices`. Only providers
 * with a genuine account-level "list my devices" API are handled here
 * (Moodo, Govee, SwitchBot). Pura/Home Assistant/HomeKit devices are
 * discovered on-device instead (Home Assistant's own `/api/states` entity
 * list, or Apple's HomeKit accessory browser) since those don't go through
 * our backend.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { user } = await requireUser(req);
    const body = await req.json() as SyncBody;
    const admin = getSupabaseAdmin();

    if (body.provider === "moodo") {
      const creds = await loadMoodoCredentials(admin, user.id);
      const client = new MoodoClient(creds.token, creds.apiBaseUrl);
      const boxes = await client.listBoxes();

      const rows = boxes.map((box) => ({
        user_id: user.id,
        provider: "moodo" as const,
        external_id: String(box.device_key),
        name: `Moodo Box ${box.device_key}`,
        capabilities: { power: true, intensity: true, scent_selection: false },
        provider_metadata: {},
        is_online: box.box_status === 1,
        last_seen_at: new Date().toISOString(),
      }));
      return await upsertAndRespond(admin, rows);
    }

    if (body.provider === "govee") {
      const creds = await loadGoveeCredentials(admin, user.id);
      const client = new GoveeClient(creds.apiKey);
      const devices = await client.listDevices();

      const rows = devices
        .filter((d) =>
          GOVEE_DIFFUSER_SKUS_HINT.some((hint) =>
            d.deviceName.toLowerCase().includes(hint) ||
            d.capabilities.some((c) => c.type.toLowerCase().includes(hint))
          )
        )
        .map((d) => {
          const powerCapability = d.capabilities.find((c) => c.instance === "powerSwitch");
          const intensityCapability = d.capabilities.find((c) => c.instance !== "powerSwitch");
          return {
            user_id: user.id,
            provider: "govee" as const,
            external_id: `${d.sku}|${d.device}`,
            name: d.deviceName,
            capabilities: {
              power: Boolean(powerCapability),
              intensity: Boolean(intensityCapability),
              scent_selection: false,
            },
            provider_metadata: intensityCapability ? { intensityCapability } : {},
            is_online: true,
            last_seen_at: new Date().toISOString(),
          };
        });
      return await upsertAndRespond(admin, rows);
    }

    if (body.provider === "switchbot") {
      const creds = await loadSwitchBotCredentials(admin, user.id);
      const client = new SwitchBotClient(creds.token, creds.secret);
      const devices = await client.listDevices();

      const rows = devices
        .filter((d) =>
          SWITCHBOT_HUMIDIFIER_TYPES.includes(d.deviceType) ||
          SWITCHBOT_PLUG_TYPES.includes(d.deviceType)
        )
        .map((d) => ({
          user_id: user.id,
          provider: "switchbot" as const,
          external_id: d.deviceId,
          name: d.deviceName,
          capabilities: {
            power: true,
            intensity: SWITCHBOT_HUMIDIFIER_TYPES.includes(d.deviceType),
            scent_selection: false,
          },
          provider_metadata: { deviceType: d.deviceType },
          is_online: true,
          last_seen_at: new Date().toISOString(),
        }));
      return await upsertAndRespond(admin, rows);
    }

    return new Response(
      JSON.stringify({ error: `Unsupported discovery provider: ${body.provider}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore no-explicit-any
async function upsertAndRespond(admin: any, rows: Record<string, unknown>[]): Promise<Response> {
  if (rows.length > 0) {
    const { error } = await admin
      .from("devices")
      .upsert(rows, { onConflict: "user_id,provider,external_id" });
    if (error) throw error;
  }
  return new Response(JSON.stringify({ synced: rows.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
