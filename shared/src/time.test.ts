import { describe, it, expect } from 'vitest';
import { hourInZone } from './time.js';

/**
 * This function was three copies before it was one, and the copies had
 * no tests between them. It decides which hour a session is attributed
 * to, which is the difference between "you focus best at 9am" and a
 * wrong claim about someone's day.
 */
describe('hourInZone', () => {
  // 2026-03-15T18:30:00Z — an afternoon in UTC, a different day-part
  // depending on where you are.
  const instant = new Date('2026-03-15T18:30:00Z');

  it('converts to the named zone rather than the host machine’s', () => {
    expect(hourInZone(instant, 'UTC')).toBe(18);
    expect(hourInZone(instant, 'America/New_York')).toBe(14);
    expect(hourInZone(instant, 'Asia/Tokyo')).toBe(3);
  });

  it('returns 0 for midnight rather than 24', () => {
    // Intl's hour12:false formats midnight as "24" in some locales, and
    // an hour of 24 would fall outside every 0-23 bucket downstream.
    expect(hourInZone(new Date('2026-03-15T00:00:00Z'), 'UTC')).toBe(0);
  });

  it('falls back to UTC on an invalid timezone instead of throwing', () => {
    // A user's stored timezone is data, and data can be wrong. Intl
    // throws a RangeError on a bad zone — which would take down the
    // whole request for the sake of one hour-of-day field.
    expect(hourInZone(instant, 'Not/AZone')).toBe(18);
    expect(hourInZone(instant, '')).toBe(18);
  });

  it('stays within 0-23 for every zone offset', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Midway', 'Asia/Kathmandu', 'UTC']) {
      const hour = hourInZone(instant, zone);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    }
  });
});
