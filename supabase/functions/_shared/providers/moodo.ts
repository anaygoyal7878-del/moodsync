/**
 * Moodo REST client.
 *
 * Endpoint shapes verified against the official Moodo Homebridge plugin
 * source (github.com/moodoapplication/homebridge-moodo,
 * src/lib/clients/moodo-api-client.ts + models/*.ts), which Moodo publishes
 * and documents at https://homebridge.moodo.co for retrieving the account
 * token. Default base URL matches Moodo's published REST host
 * (rest.moodo.co) but is left configurable since Moodo does not hardcode it
 * in their own plugin either.
 */

const DEFAULT_BASE_URL = "https://rest.moodo.co/api";

export interface MoodoSlot {
  slot_id: number;
  fan_speed: number; // 0-100
  fan_active: boolean;
  capsule_info: Record<string, unknown> | null;
}

export interface MoodoBox {
  device_key: number;
  fan_volume: number;
  box_status: 0 | 1; // 0 = Off, 1 = On
  settings: MoodoSlot[];
}

export class MoodoApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export class MoodoClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        token: this.token,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new MoodoApiError(
        `Moodo API request failed: ${init.method ?? "GET"} ${path} -> ${res.status}`,
        res.status,
      );
    }
    return res;
  }

  async listBoxes(): Promise<MoodoBox[]> {
    const res = await this.request("/boxes");
    const body = await res.json() as { boxes: MoodoBox[] };
    return body.boxes;
  }

  async powerOn(deviceKey: number): Promise<void> {
    await this.request(`/boxes/${deviceKey}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async powerOff(deviceKey: number): Promise<void> {
    await this.request(`/boxes/${deviceKey}`, { method: "DELETE" });
  }

  /** fanVolume is 0-100, matches Moodo's `fan_volume` scale. */
  async setIntensity(deviceKey: number, fanVolume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(fanVolume)));
    await this.request(`/intensity/${deviceKey}`, {
      method: "POST",
      body: JSON.stringify({
        fan_volume: clamped,
        restful_request_id: crypto.randomUUID(),
      }),
    });
  }
}
