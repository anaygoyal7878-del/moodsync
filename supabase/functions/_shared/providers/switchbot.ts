/**
 * SwitchBot official REST API v1.1 (github.com/OpenWonderLabs/SwitchBotAPI).
 * SwitchBot has no dedicated "diffuser" device type; its Smart Wi-Fi
 * Ultrasonic Humidifier (which includes an essential-oil tray) is
 * API-classified under `Humidifier` device types, and its `Plug`/`Plug Mini`
 * device types serve as the generic power-only fallback for any other
 * diffuser plugged into one.
 */

const BASE_URL = "https://api.switch-bot.com";

export class SwitchBotApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string; // e.g. "Humidifier", "Plug Mini (US)"
  hubDeviceId: string;
}

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export class SwitchBotClient {
  constructor(private readonly token: string, private readonly secret: string) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signBase = this.token + t + nonce;
    const sign = (await hmacSha256Base64(this.secret, signBase)).toUpperCase();
    return {
      Authorization: this.token,
      sign,
      t,
      nonce,
      "Content-Type": "application/json; charset=utf8",
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = await this.authHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      throw new SwitchBotApiError(
        `SwitchBot request failed: ${init.method ?? "GET"} ${path} -> ${res.status}`,
        res.status,
      );
    }
    return res.json();
  }

  async listDevices(): Promise<SwitchBotDevice[]> {
    const body = await this.request("/v1.1/devices") as {
      body: { deviceList: SwitchBotDevice[] };
    };
    return body.body?.deviceList ?? [];
  }

  async sendCommand(
    deviceId: string,
    command: string,
    parameter: string | Record<string, unknown> = "default",
    commandType: string = "command",
  ): Promise<void> {
    await this.request(`/v1.1/devices/${deviceId}/commands`, {
      method: "POST",
      body: JSON.stringify({ command, parameter, commandType }),
    });
  }

  async turnOn(deviceId: string): Promise<void> {
    await this.sendCommand(deviceId, "turnOn");
  }

  async turnOff(deviceId: string): Promise<void> {
    await this.sendCommand(deviceId, "turnOff");
  }
}
