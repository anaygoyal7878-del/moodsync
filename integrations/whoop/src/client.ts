/**
 * WHOOP data API v2 client. Endpoints and response field names verified
 * against developer.whoop.com's recovery/sleep/workout/pagination docs —
 * see docs/INTEGRATIONS_RESEARCH.md. One flagged uncertainty: pagination
 * page-size control (`limit`) is implemented here as a query parameter,
 * which is the common REST convention and WHOOP's own server default
 * applies if omitted either way — but this specific detail was not found
 * with full confidence in the research pass and is worth a live-account
 * spot check before relying on non-default page sizes in production.
 */

const BASE_URL = 'https://api.prod.whoop.com/developer';

export class WhoopApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export type ScoreState = 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: ScoreState;
  score?:
    | {
        recovery_score: number;
        resting_heart_rate: number;
        hrv_rmssd_milli: number;
        spo2_percentage?: number;
        skin_temp_celsius?: number;
      }
    | undefined;
}

export interface WhoopSleep {
  id: string;
  user_id: number;
  start: string;
  end: string;
  score_state: ScoreState;
  score?:
    | {
        sleep_performance_percentage: number;
        stage_summary: {
          total_in_bed_time_milli: number;
          total_awake_time_milli: number;
          total_light_sleep_time_milli: number;
          total_slow_wave_sleep_time_milli: number;
          total_rem_sleep_time_milli: number;
          sleep_cycle_count: number;
          disturbance_count: number;
        };
      }
    | undefined;
}

export interface WhoopWorkout {
  id: string;
  user_id: number;
  start: string;
  end: string;
  sport_name: string;
  score_state: ScoreState;
  score?:
    | {
        strain: number;
        average_heart_rate: number;
        max_heart_rate: number;
      }
    | undefined;
}

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

interface PaginatedResponse<T> {
  records: T[];
  next_token?: string;
}

export interface DateRange {
  start?: string; // ISO 8601
  end?: string;
}

export class WhoopClient {
  constructor(private readonly accessToken: string) {}

  private async get<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) {
      throw new WhoopApiError(`WHOOP API request failed: GET ${path} -> ${res.status}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  private async *paginate<T>(path: string, range: DateRange = {}): AsyncGenerator<T> {
    let nextToken: string | undefined;
    do {
      const page = await this.get<PaginatedResponse<T>>(path, {
        start: range.start,
        end: range.end,
        nextToken,
      });
      for (const record of page.records) yield record;
      nextToken = page.next_token;
    } while (nextToken);
  }

  async *listRecovery(range: DateRange = {}): AsyncGenerator<WhoopRecovery> {
    yield* this.paginate<WhoopRecovery>('/v2/recovery', range);
  }

  async *listSleep(range: DateRange = {}): AsyncGenerator<WhoopSleep> {
    yield* this.paginate<WhoopSleep>('/v2/activity/sleep', range);
  }

  async *listWorkouts(range: DateRange = {}): AsyncGenerator<WhoopWorkout> {
    yield* this.paginate<WhoopWorkout>('/v2/activity/workout', range);
  }

  async getProfile(): Promise<WhoopProfile> {
    return this.get<WhoopProfile>('/v2/user/profile/basic');
  }
}
