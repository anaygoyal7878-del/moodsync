/**
 * Philips Hue Remote API (CLIP v2) client. The resource path structure and
 * auth headers below are confirmed directly from working production code
 * (Q42.HueApi's RemoteHueApi.cs — see docs/INTEGRATIONS_RESEARCH.md):
 * base `https://api.meethue.com/route/`, resources at
 * `clip/v2/resource/{light,scene}`, `Authorization: Bearer <token>` +
 * `hue-application-key: <key>` headers.
 *
 * `createApplicationKey` is the one part of this client NOT independently
 * confirmed for the CLIP v2 remote flow specifically — it adapts the
 * well-documented Hue v1 bridge-pairing pattern (POST a devicetype to
 * mint a long-lived "username"/application key) to the confirmed
 * `/route/` remote proxy prefix, based on the same pattern found in
 * node-hue-api's legacy RemoteBootstrap client. Spot-check this against a
 * live Hue developer account before relying on it in production.
 */

const REMOTE_BASE_URL = 'https://api.meethue.com/route';

export class HueApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface HueV1Envelope<T> {
  success?: T;
  error?: { type: number; address: string; description: string };
}

export async function createHueApplicationKey(accessToken: string): Promise<string> {
  const res = await fetch(`${REMOTE_BASE_URL}/api`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ devicetype: 'moodsync#server' }),
  });
  if (!res.ok) {
    throw new HueApiError(`Failed to create Hue application key: ${res.status} ${await res.text()}`, res.status);
  }

  const body = (await res.json()) as HueV1Envelope<{ username: string }>[];
  const entry = body[0];
  if (!entry?.success?.username) {
    throw new HueApiError(`Hue did not return an application key: ${JSON.stringify(body)}`);
  }
  return entry.success.username;
}

export interface HueLight {
  id: string;
  metadata: { name: string };
  on: { on: boolean };
  dimming?: { brightness: number };
}

export interface HueScene {
  id: string;
  metadata: { name: string };
}

export interface HueLightState {
  on?: boolean | undefined;
  /** 0-100 */
  brightness?: number | undefined;
  /** CIE xy chromaticity, the CLIP v2 primary color model */
  colorXy?: { x: number; y: number } | undefined;
  /** Color temperature in mirek (not simultaneous with colorXy) */
  colorTemperatureMirek?: number | undefined;
}

/** Pure so it's unit-testable without a network mock. */
export function buildLightStatePayload(state: HueLightState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (state.on !== undefined) payload.on = { on: state.on };
  if (state.brightness !== undefined) payload.dimming = { brightness: state.brightness };
  if (state.colorXy !== undefined) payload.color = { xy: state.colorXy };
  if (state.colorTemperatureMirek !== undefined) {
    payload.color_temperature = { mirek: state.colorTemperatureMirek };
  }
  return payload;
}

export class HueClient {
  constructor(private readonly accessToken: string, private readonly applicationKey: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${REMOTE_BASE_URL}/clip/v2/resource${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'hue-application-key': this.applicationKey,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new HueApiError(`Hue API request failed: ${init.method ?? 'GET'} ${path} -> ${res.status}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  async listLights(): Promise<HueLight[]> {
    const body = await this.request<{ data: HueLight[] }>('/light');
    return body.data;
  }

  async setLightState(lightId: string, state: HueLightState): Promise<void> {
    const payload = buildLightStatePayload(state);
    await this.request(`/light/${lightId}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async listScenes(): Promise<HueScene[]> {
    const body = await this.request<{ data: HueScene[] }>('/scene');
    return body.data;
  }

  async activateScene(sceneId: string): Promise<void> {
    await this.request(`/scene/${sceneId}`, {
      method: 'PUT',
      body: JSON.stringify({ recall: { action: 'active' } }),
    });
  }
}
