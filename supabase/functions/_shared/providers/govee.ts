/**
 * Govee public REST API (developer.govee.com), verified against the live
 * API reference: base host, auth header, `/device/control` and
 * `/device/state` request/response shapes for "Get You Devices",
 * "Control You Device", and "Get Devices Status".
 *
 * Govee's own device-type enum includes `devices.types.aroma_diffuser` and
 * `devices.types.humidifier` (confirmed from their docs), so this is a
 * genuine direct integration, not a smart-plug workaround.
 *
 * Deliberately does NOT hardcode a capability instance name for mist
 * level/intensity: Govee's docs don't publicly enumerate one consistent
 * instance string across every diffuser/humidifier SKU, and guessing one
 * would risk silently no-op'ing on real hardware. Instead we read each
 * device's own advertised capabilities from `/user/devices` and act on
 * whichever non-power capability it reports.
 */

const BASE_URL = "https://openapi.api.govee.com";

export interface GoveeCapability {
  type: string;
  instance: string;
  parameters?: Record<string, unknown>;
}

export interface GoveeDevice {
  sku: string;
  device: string; // device id (often a MAC-like string)
  deviceName: string;
  capabilities: GoveeCapability[];
}

export class GoveeApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const POWER_CAPABILITY = { type: "devices.capabilities.on_off", instance: "powerSwitch" };

export class GoveeClient {
  constructor(private readonly apiKey: string) {}

  private async request(path: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Govee-API-Key": this.apiKey,
      },
      body: JSON.stringify({ requestId: crypto.randomUUID(), ...body }),
    });
    if (!res.ok) {
      throw new GoveeApiError(`Govee API request failed: ${path} -> ${res.status}`, res.status);
    }
    return res.json();
  }

  async listDevices(): Promise<GoveeDevice[]> {
    const res = await fetch(`${BASE_URL}/router/api/v1/user/devices`, {
      headers: { "Govee-API-Key": this.apiKey },
    });
    if (!res.ok) {
      throw new GoveeApiError(`Govee list devices failed -> ${res.status}`, res.status);
    }
    const body = await res.json() as { data: GoveeDevice[] };
    return body.data ?? [];
  }

  async setPower(sku: string, device: string, on: boolean): Promise<void> {
    await this.request("/router/api/v1/device/control", {
      payload: {
        sku,
        device,
        capability: { ...POWER_CAPABILITY, value: on ? 1 : 0 },
      },
    });
  }

  /**
   * Sets intensity using the device's own first non-power capability
   * (typically a `devices.capabilities.range` or `devices.capabilities.work_mode`
   * entry) rather than an assumed instance name. `intensity01` is 0...1 and
   * gets scaled into that capability's advertised range when one is present.
   */
  async setIntensity(
    sku: string,
    device: string,
    intensityCapability: GoveeCapability,
    intensity01: number,
  ): Promise<void> {
    const range = intensityCapability.parameters?.range as
      | { min: number; max: number }
      | undefined;
    const min = range?.min ?? 0;
    const max = range?.max ?? 100;
    const value = Math.round(min + intensity01 * (max - min));

    await this.request("/router/api/v1/device/control", {
      payload: {
        sku,
        device,
        capability: {
          type: intensityCapability.type,
          instance: intensityCapability.instance,
          value,
        },
      },
    });
  }
}
