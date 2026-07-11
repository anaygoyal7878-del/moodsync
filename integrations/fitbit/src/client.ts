/**
 * Google Health API v4 client. Resource paths, methods, and schema field
 * names verified against developers.google.com/health's REST/RPC
 * reference and the live Discovery document — see
 * docs/INTEGRATIONS_RESEARCH.md's "REST implementation details" section
 * for exactly what was confirmed vs. inferred-by-pattern.
 */

const BASE_URL = 'https://health.googleapis.com/v4';

export class GoogleHealthApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

function toCivilDateTime(date: Date): CivilDateTime {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

export interface RollupDataPoint {
  civilStartTime: CivilDateTime;
  civilEndTime: CivilDateTime;
  steps?: { countSum: number };
  heartRate?: { bpmMin: number; bpmMax: number; bpmAvg: number };
  totalCalories?: { kcalSum: number };
}

export interface DailyRestingHeartRatePoint {
  name: string;
  data: { dailyRestingHeartRate: { date: { year: number; month: number; day: number }; beatsPerMinute: number } };
}

export interface SleepStageSummary {
  sleepStageType: 'SLEEP_STAGE_TYPE_UNSPECIFIED' | 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';
  /** Duration serialized the way protobuf's `google.protobuf.Duration`
   * renders in JSON: a string like `"1800s"`. */
  totalDuration: string;
}

export interface SleepDataPoint {
  name: string;
  data: {
    sleep: {
      // `startTime`/`endTime` are `ObservationSampleTime` messages, not
      // plain ISO strings — their JSON wire shape wasn't confirmable via
      // docs (see docs/INTEGRATIONS_RESEARCH.md), so deliberately left
      // untyped rather than guessed at. Only `sleepSummary` (a plain,
      // confirmed schema) is relied on for normalization.
      startTime: unknown;
      endTime: unknown;
      sleepSummary?: { stageSummary?: SleepStageSummary[] };
    };
  };
}

/** A `dailyRollUp`-aggregatable metric — the only three dataTypes this
 * integration reads that way. `daily-resting-heart-rate` is already
 * daily-granularity and `sleep` is a session type, so both use `list`
 * instead (see below). */
export type RollupDataType = 'steps' | 'heart-rate' | 'total-calories';

/** Verified against `users.pairedDevices` in the REST reference — the one
 * data type this integration reads that isn't a `dataTypes.dataPoints`
 * resource at all, it's the paired-tracker/scale list itself. */
export interface PairedDevice {
  name: string;
  deviceType: 'TRACKER' | 'SCALE';
  batteryStatus?: 'High' | 'Medium' | 'Low' | 'Empty';
  batteryLevel?: number;
  lastSyncTime?: string;
  deviceVersion?: string;
}

/** A user can have both a tracker and a smart scale paired — the tracker
 * is what a "connections" list means by "the device" (it's the one that
 * produces the biometric readings this integration syncs), so it's
 * preferred when present. Pure so it's unit-testable without a network
 * mock; shared (not duplicated) between the backend service and the
 * standalone sync worker since it has no deployment-target-specific
 * dependencies, unlike the token-refresh logic those two do duplicate. */
export function pickPrimaryDevice(devices: PairedDevice[]): PairedDevice | undefined {
  return devices.find((d) => d.deviceType === 'TRACKER') ?? devices[0];
}

export class GoogleHealthClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new GoogleHealthApiError(`Google Health API request failed: ${path} -> ${res.status}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  async dailyRollUp(dataType: RollupDataType, since: Date, until: Date): Promise<RollupDataPoint[]> {
    const { rollupDataPoints } = await this.request<{ rollupDataPoints?: RollupDataPoint[] }>(
      `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          range: { start: toCivilDateTime(since), end: toCivilDateTime(until) },
          windowSizeDays: 1,
        }),
      },
    );
    return rollupDataPoints ?? [];
  }

  async listDailyRestingHeartRate(since: Date): Promise<DailyRestingHeartRatePoint[]> {
    const filter = `dailyRestingHeartRate.date >= "${since.toISOString().slice(0, 10)}"`;
    const path = `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: DailyRestingHeartRatePoint[] }>(path);
    return dataPoints ?? [];
  }

  async listSleep(since: Date): Promise<SleepDataPoint[]> {
    const filter = `sleep.start_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/sleep/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: SleepDataPoint[] }>(path);
    return dataPoints ?? [];
  }

  async listPairedDevices(): Promise<PairedDevice[]> {
    const { pairedDevices } = await this.request<{ pairedDevices?: PairedDevice[] }>('/users/me/pairedDevices');
    return pairedDevices ?? [];
  }
}
