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
  /** Field names confirmed against `HeartRateRollupValue` in the live REST
   * reference — the API returns the full `beatsPerMinute{Min,Max,Avg}`
   * names, not the shorter `bpm*` guessed in an earlier pass. */
  heartRate?: { beatsPerMinuteMin: number; beatsPerMinuteMax: number; beatsPerMinuteAvg: number };
  totalCalories?: { kcalSum: number };
}

/** `ObservationSampleTime` — confirmed schema for `HeartRate.sampleTime`.
 * `physicalTime` is the RFC 3339 instant the sample was recorded; that's
 * what per-sample heart rate normalization keys on. */
export interface ObservationSampleTime {
  physicalTime?: string;
  utcOffset?: string;
  civilTime?: CivilDateTime;
}

/** A single heart-rate sample (not a daily aggregate) — confirmed schema
 * for the `heart-rate` dataType's `HeartRate` message. `beatsPerMinute` is
 * serialized as a string (protobuf int64-as-string JSON convention). */
export interface HeartRateSamplePoint {
  name: string;
  data: {
    heartRate: {
      sampleTime: ObservationSampleTime;
      beatsPerMinute: string;
    };
  };
}

export interface DailyRestingHeartRatePoint {
  name: string;
  data: { dailyRestingHeartRate: { date: { year: number; month: number; day: number }; beatsPerMinute: number } };
}

/** Confirmed against the live REST reference's `Sleep` message — the
 * earlier `sleepSummary.stageSummary[].{sleepStageType,totalDuration}`
 * shape didn't match the real API at all; the actual nesting is
 * `summary.stagesSummary[].{type,minutes}`. */
export interface SleepStageSummaryEntry {
  type: 'SLEEP_STAGE_TYPE_UNSPECIFIED' | 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM' | 'ASLEEP' | 'RESTLESS';
  /** int64-as-string minute count — NOT a protobuf Duration string. */
  minutes: string;
}

export interface SleepDataPoint {
  name: string;
  data: {
    sleep: {
      /** Real ISO 8601 timestamps, confirmed nested under `interval` (not
       * directly on `sleep` as previously assumed). */
      interval: { startTime: string; endTime: string };
      summary?: {
        stagesSummary?: SleepStageSummaryEntry[];
        /** Pre-computed by Google Health — preferred over summing
         * `stagesSummary` by hand for efficiency/duration calculations. */
        minutesInSleepPeriod?: string;
        minutesAfterWakeUp?: string;
        minutesToFallAsleep?: string;
        minutesAsleep?: string;
        minutesAwake?: string;
      };
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

  /** Individual timestamped heart-rate samples (not a daily average) —
   * what "current"/near-live heart rate is built on. The filter field path
   * (`heart_rate.sample_time.physical_time`) follows the same
   * `{dataType_snake}.{field_snake}` pattern already used by
   * `listSleep`'s `sleep.start_time` filter; the exact filter grammar for
   * this specific field wasn't independently doc-confirmed, only inferred
   * by pattern — flagged here the same way the pre-existing `listSleep`
   * filter was. */
  async listHeartRate(since: Date): Promise<HeartRateSamplePoint[]> {
    const filter = `heart_rate.sample_time.physical_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/heart-rate/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: HeartRateSamplePoint[] }>(path);
    return dataPoints ?? [];
  }

  async listPairedDevices(): Promise<PairedDevice[]> {
    const { pairedDevices } = await this.request<{ pairedDevices?: PairedDevice[] }>('/users/me/pairedDevices');
    return pairedDevices ?? [];
  }
}
