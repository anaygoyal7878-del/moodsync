import { describe, expect, it, vi } from 'vitest';
import { weatherCodeToCondition } from './client.js';

describe('weatherCodeToCondition', () => {
  it('maps clear-sky codes', () => {
    expect(weatherCodeToCondition(0)).toBe('clear');
    expect(weatherCodeToCondition(1)).toBe('clear');
  });

  it('maps cloudy codes', () => {
    expect(weatherCodeToCondition(2)).toBe('cloudy');
    expect(weatherCodeToCondition(3)).toBe('cloudy');
  });

  it('maps rain and drizzle codes', () => {
    for (const code of [51, 55, 61, 65, 67, 80, 82]) {
      expect(weatherCodeToCondition(code)).toBe('rain');
    }
  });

  it('maps snow codes', () => {
    for (const code of [71, 75, 85, 86]) {
      expect(weatherCodeToCondition(code)).toBe('snow');
    }
  });

  it('maps thunderstorm codes', () => {
    expect(weatherCodeToCondition(95)).toBe('storm');
    expect(weatherCodeToCondition(99)).toBe('storm');
  });

  it('maps fog codes', () => {
    expect(weatherCodeToCondition(45)).toBe('fog');
    expect(weatherCodeToCondition(48)).toBe('fog');
  });

  it('falls back to cloudy for an unrecognized code rather than throwing', () => {
    expect(weatherCodeToCondition(9999)).toBe('cloudy');
  });
});

describe('geocodeLocation / getCurrentWeather', () => {
  it('returns null when the geocoding API has no results', async () => {
    const { geocodeLocation } = await import('./client.js');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const result = await geocodeLocation('Nowhereville');
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it('parses a real-shaped forecast response', async () => {
    const { getCurrentWeather } = await import('./client.js');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ current: { temperature_2m: 18.5, weather_code: 61, precipitation: 0.4, is_day: 1 } }),
          { status: 200 },
        ),
      ),
    );
    const weather = await getCurrentWeather(52.52, 13.41);
    expect(weather).toEqual({ temperatureC: 18.5, condition: 'rain', isDay: true, precipitationMm: 0.4 });
    vi.unstubAllGlobals();
  });
});
