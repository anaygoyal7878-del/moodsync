/**
 * Generic Home Assistant REST API client (developers.home-assistant.io/docs/api/rest).
 *
 * This is the integration path for any diffuser that has no direct public
 * cloud API of its own — e.g. Pura (via the community `ha-pura` HACS
 * integration, github.com/natekspencer/ha-pura) or Rituals Perfume Genie
 * (Home Assistant's own official `rituals_perfume_genie` core integration).
 * We never talk to those vendors' private/reverse-engineered APIs directly;
 * we only call the user's own Home Assistant instance, which they already
 * trust with those credentials.
 */

export type HomeAssistantDomain =
  | "switch"
  | "light"
  | "humidifier"
  | "select"
  | "button";

export class HomeAssistantApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export class HomeAssistantClient {
  private readonly baseUrl: string;
  private readonly longLivedToken: string;

  /** baseUrl example: https://homeassistant.local:8123 or a Nabu Casa URL */
  constructor(baseUrl: string, longLivedToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.longLivedToken = longLivedToken;
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.longLivedToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new HomeAssistantApiError(
        `Home Assistant request failed: ${init.method ?? "GET"} ${path} -> ${res.status}`,
        res.status,
      );
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** Calls a Home Assistant service, e.g. domain="switch", service="turn_on". */
  async callService(
    domain: HomeAssistantDomain,
    service: string,
    entityId: string,
    serviceData: Record<string, unknown> = {},
  ): Promise<void> {
    await this.call(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId, ...serviceData }),
    });
  }

  async turnOn(entityId: string, domain: HomeAssistantDomain = "switch") {
    await this.callService(domain, "turn_on", entityId);
  }

  async turnOff(entityId: string, domain: HomeAssistantDomain = "switch") {
    await this.callService(domain, "turn_off", entityId);
  }

  /** For humidifier-domain entities (e.g. VOCOlinc FlowerBud style devices exposed via HA). */
  async setHumidifierIntensity(entityId: string, percentage: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
    await this.callService("humidifier", "set_humidity", entityId, {
      humidity: clamped,
    });
  }

  async getEntityState(entityId: string): Promise<{ state: string; attributes: Record<string, unknown> }> {
    return await this.call(`/api/states/${entityId}`) as {
      state: string;
      attributes: Record<string, unknown>;
    };
  }
}
