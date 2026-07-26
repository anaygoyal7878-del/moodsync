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
    /** Google's raw error response body — captured so a real API error
     * (e.g. a schema mismatch) is diagnosable from logs alone instead of
     * needing a live out-of-band request to reproduce, which is how the
     * bug this field exists to prevent was originally found. */
    readonly responseBody?: string,
    /** Parsed from Google's `Retry-After` response header (seconds,
     * converted to ms) when present — lets the retry loop honor the
     * server's own guidance instead of guessing via backoff alone. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** Confirmed against the live REST reference's `CivilDateTime` type
 * definition — NOT a flat `{year,month,day,hour,minute,second}` object,
 * despite that being a very natural first guess (and what this file
 * originally shipped with). The real shape nests a `google.type.Date`
 * under `date` and an optional `google.type.TimeOfDay` under `time`,
 * with `time`'s fields plural (`hours`/`minutes`/`seconds`, plus
 * `nanos`) — confirmed by reproducing the exact 400 `INVALID_ARGUMENT`
 * Google returns for the old flat shape ("Unknown name \"year\" at
 * 'range.start'") against a real linked account, then re-verifying
 * against the doc's type definition before writing this fix. This
 * silently broke every `dailyRollUp` call (steps, heart-rate,
 * total-calories) since the field was introduced — see
 * docs/INTEGRATIONS_RESEARCH.md's correction note. */
export interface CivilDateTime {
  date: { year: number; month: number; day: number };
  time?: { hours: number; minutes: number; seconds: number; nanos?: number };
}

function toCivilDateTime(date: Date): CivilDateTime {
  return {
    date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    time: { hours: date.getUTCHours(), minutes: date.getUTCMinutes(), seconds: date.getUTCSeconds() },
  };
}

export interface RollupDataPoint {
  civilStartTime: CivilDateTime;
  civilEndTime: CivilDateTime;
  /** `countSum` is an int64 field, which Google Health's REST API
   * serializes as a JSON string (standard protobuf-JSON behavior for
   * int64, to avoid precision loss) — confirmed by a real sync hitting
   * a live account and getting `"2094"` here, not `2094`. `kcalSum`
   * below is a float64 and comes through as a real JSON number, so it
   * doesn't need the same treatment. */
  steps?: { countSum: number | string };
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

/** Retried statuses: 429 (Google's own per-user rate limit, see
 * docs/MILESTONES.md's 5-minute-cadence rate-limit math) and 5xx
 * (transient server-side failures) — never 4xx other than 429, since
 * those (400/401/403/404) indicate a request that will fail identically
 * on retry (bad filter syntax, expired/invalid token, wrong scope). */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GoogleHealthClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Honor Google's own `Retry-After` header when present (real
        // rate-limit guidance from the server), otherwise fall back to
        // exponential backoff with jitter — same shape as the
        // reconnect/backoff pattern already documented for other
        // providers in this codebase.
        const retryAfterMs = lastError instanceof GoogleHealthApiError ? lastError.retryAfterMs : undefined;
        const backoff = retryAfterMs ?? BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 200;
        await sleep(backoff);
      }

      let res: Response;
      try {
        res = await fetch(`${BASE_URL}${path}`, {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${this.accessToken}` },
        });
      } catch (error) {
        // Network-level failure (DNS, connection reset, timeout) — no
        // response at all, so no status to check; retry the same as a
        // 5xx, since these are equally transient.
        lastError = error;
        if (attempt === MAX_RETRIES) throw error;
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
        const apiError = new GoogleHealthApiError(
          `Google Health API request failed: ${path} -> ${res.status}`,
          res.status,
          body,
          Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
        );
        if (!isRetryableStatus(res.status) || attempt === MAX_RETRIES) throw apiError;
        lastError = apiError;
        continue;
      }

      return res.json() as Promise<T>;
    }
    // Unreachable in practice (the loop always throws or returns before
    // exhausting MAX_RETRIES+1 iterations) — satisfies the compiler's
    // control-flow analysis without a fake return value.
    throw lastError;
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

  /** Confirmed against a real 400 (`INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION`,
   * "Restriction member path segment 'dailyRestingHeartRate' does not
   * match any data type") from a live linked account: filter expressions
   * must reference the data type in **snake_case**
   * (`daily_resting_heart_rate`), not the camelCase field name the JSON
   * response happens to use (`dailyRestingHeartRate`) — confirmed
   * against the docs' own naming-convention note ("in a filter
   * parameter... the data type name must be in snake case"), which this
   * client had read but not actually applied here. */
  async listDailyRestingHeartRate(since: Date): Promise<DailyRestingHeartRatePoint[]> {
    const filter = `daily_resting_heart_rate.date >= "${since.toISOString().slice(0, 10)}"`;
    const path = `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: DailyRestingHeartRatePoint[] }>(path);
    return dataPoints ?? [];
  }

  /** Confirmed against the live REST reference (reproducing the exact
   * `INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER` / "Member
   * 'sleep.start_time' is not supported for filtering" error against a
   * real linked account first, then re-verifying against the docs):
   * `sleep` only supports filtering by **end** time
   * (`interval.end_time`/`interval.civil_end_time`) — there is no
   * start-time filter for this data type at all. A session that ended
   * after `since` is what "sleep sessions since N days ago" means here;
   * this is a real, permanent API constraint, not a bug in the filter
   * string's syntax. */
  async listSleep(since: Date): Promise<SleepDataPoint[]> {
    const filter = `sleep.interval.end_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/sleep/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: SleepDataPoint[] }>(path);
    return dataPoints ?? [];
  }

  /** Individual timestamped heart-rate samples (not a daily average) —
   * what "current"/near-live heart rate is built on. The filter
   * `heart_rate.sample_time.physical_time >= "..."` is now independently
   * confirmed against a live doc excerpt verbatim (previously only
   * inferred by pattern from `listSleep`'s filter — which, unlike this
   * one, turned out to be wrong; see `listSleep`'s doc comment). */
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

  /** `active-minutes` is a confirmed-shipped Activity & Fitness data
   * type (Google Health API release notes, checked live this session —
   * not "coming soon"). **Unlike every other method in this file, the
   * exact response field names below are NOT confirmed against a real
   * linked account** — this integration has always required reproducing
   * a live 400 error to nail down exact field casing (see
   * `CivilDateTime`'s and `listDailyRestingHeartRate`'s doc comments for
   * two real examples of the documented shape being wrong), and no live
   * Google Health account was available to do that for this method.
   * Parsing in `normalize.ts` is defensive (falls back to 0 / skips
   * rather than throwing) specifically because of this uncertainty. */
  async listActiveMinutes(since: Date): Promise<ActiveMinutesDataPoint[]> {
    const filter = `active_minutes.interval.end_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/active-minutes/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: ActiveMinutesDataPoint[] }>(path);
    return dataPoints ?? [];
  }

  /** `time-in-heart-rate-zone` — same "shipped but not live-confirmed"
   * caveat as `listActiveMinutes` above. */
  async listHeartRateZoneMinutes(since: Date): Promise<HeartRateZoneDataPoint[]> {
    const filter = `time_in_heart_rate_zone.interval.end_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/time-in-heart-rate-zone/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: HeartRateZoneDataPoint[] }>(path);
    return dataPoints ?? [];
  }

  /** `exercise` — confirmed-shipped session data type with write support
   * too (this integration only reads). Same "not live-confirmed" caveat.
   * Workouts are deliberately NOT folded into `NormalizedBiometricReading`
   * (a daily scalar snapshot) — a workout is a discrete event with its
   * own start/end/type, which doesn't fit a one-row-per-day shape
   * without losing information. See docs/GOOGLE_HEALTH_SYNC_ARCHITECTURE.md
   * for why full workout/session modeling is out of scope this round. */
  async listExercise(since: Date): Promise<ExerciseDataPoint[]> {
    const filter = `exercise.interval.end_time >= "${since.toISOString()}"`;
    const path = `/users/me/dataTypes/exercise/dataPoints?filter=${encodeURIComponent(filter)}`;
    const { dataPoints } = await this.request<{ dataPoints?: ExerciseDataPoint[] }>(path);
    return dataPoints ?? [];
  }
}

/** Not independently confirmed against a live account — see
 * `listActiveMinutes`'s doc comment. Modeled loosely (optional fields,
 * no assumed nesting depth beyond what the docs describe) so a wrong
 * guess fails soft in `normalize.ts` rather than throwing. */
export interface ActiveMinutesDataPoint {
  name: string;
  data?: {
    activeMinutes?: {
      interval?: { startTime?: string; endTime?: string };
      activeMinutesByActivityLevel?: Record<string, { minutes?: number | string }>;
    };
  };
}

export interface HeartRateZoneDataPoint {
  name: string;
  data?: {
    timeInHeartRateZone?: {
      interval?: { startTime?: string; endTime?: string };
      heartRateZoneType?: string;
      minutes?: number | string;
    };
  };
}

export interface ExerciseDataPoint {
  name: string;
  data?: {
    exercise?: {
      interval?: { startTime?: string; endTime?: string };
      exerciseType?: string;
      displayName?: string;
      activeDuration?: string;
      metricsSummary?: { calories?: number; distanceMeters?: number; averageHeartRate?: number };
    };
  };
}
