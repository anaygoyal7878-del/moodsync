/**
 * Open-Meteo — chosen specifically because it requires no API key/OAuth
 * for non-commercial use (confirmed live against open-meteo.com/en/docs
 * this session: "Only required to commercial use to access reserved API
 * resources"), unlike every other integration in this codebase, which
 * is OAuth-based. There is no MoodSync account-linking step for weather
 * at all — just a user-set location (see `UserPreferences` in
 * schema.prisma) resolved once via geocoding, then read on demand.
 */

const FORECAST_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export class WeatherApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface GeocodedLocation {
  name: string;
  latitude: number;
  longitude: number;
  /** e.g. "US", "GB" — shown alongside the resolved city name so a user
   * picking "Springfield" can tell which country's result they got. */
  countryCode?: string | undefined;
  admin1?: string | undefined;
}

/** WMO weather interpretation codes (confirmed live against
 * open-meteo.com/en/docs this session) collapsed into MoodSync's own
 * small condition set — only as granular as the product actually needs
 * (Music Intelligence's "Rainy Day" category, Home Health context), not
 * a full weather-app taxonomy. */
export type WeatherCondition = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Maps a raw WMO code to MoodSync's condition set. Codes confirmed live
 * this session: 0 clear, 1-3 mainly-clear/partly-cloudy/overcast, 45/48
 * fog, 51-57 drizzle, 61-67 rain (incl. freezing rain), 71-77 snow,
 * 80-82 rain showers, 85-86 snow showers, 95-99 thunderstorm. Anything
 * outside this confirmed set falls back to 'cloudy' rather than
 * throwing — an unrecognized code shouldn't break a weather-aware
 * feature, it should just degrade to the least specific real category. */
export function weatherCodeToCondition(code: number): WeatherCondition {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

export interface CurrentWeather {
  temperatureC: number;
  condition: WeatherCondition;
  isDay: boolean;
  /** mm, from Open-Meteo's `precipitation` field — kept alongside
   * `condition` since "rain" as a WMO code and "actual precipitation
   * right now" can momentarily disagree (e.g. code updates hourly). */
  precipitationMm: number;
}

async function requestJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    throw new WeatherApiError(`Network error calling Open-Meteo: ${(error as Error).message}`);
  }
  if (!res.ok) {
    throw new WeatherApiError(`Open-Meteo request failed: ${url} -> ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

interface GeocodingResponse {
  results?: { name: string; latitude: number; longitude: number; country_code?: string; admin1?: string }[];
}

/** Resolves a free-text city name (what a user actually types into a
 * settings field) to coordinates — the only "account linking" step this
 * integration has. Returns the top result only; a user picking between
 * ambiguous matches (two "Springfield"s) isn't handled — same
 * intentionally-minimal scope as every other honest first-pass
 * integration in this codebase, not a fully-built location picker. */
export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const url = `${GEOCODING_BASE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const data = await requestJson<GeocodingResponse>(url);
  const result = data.results?.[0];
  if (!result) return null;
  return {
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    countryCode: result.country_code,
    admin1: result.admin1,
  };
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    precipitation?: number;
    is_day?: number;
  };
}

export async function getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather> {
  const url = `${FORECAST_BASE_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,precipitation,is_day`;
  const data = await requestJson<ForecastResponse>(url);
  const current = data.current;
  if (!current || current.temperature_2m === undefined || current.weather_code === undefined) {
    throw new WeatherApiError('Open-Meteo response missing expected current-weather fields');
  }
  return {
    temperatureC: current.temperature_2m,
    condition: weatherCodeToCondition(current.weather_code),
    isDay: current.is_day !== 0,
    precipitationMm: current.precipitation ?? 0,
  };
}
