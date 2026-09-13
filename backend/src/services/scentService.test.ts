import { describe, it, expect } from 'vitest';
import { withoutEchoes } from './scentService.js';
import { parseLocalDate, startOfLocalDayUtc, localMinutesNow } from './workoutService.js';

/**
 * The echo filter exists because `recommendScent` composes its reasons
 * for a caller that renders one paragraph, while this payload returns
 * description and notes as their own fields. Without it the Fragrance
 * page rendered the fragrance's description twice — once as the
 * description, once verbatim as a bullet directly beneath it.
 */
describe('withoutEchoes', () => {
  const description = 'Bold and commanding. A masterful balance of strength and elegance for unforgettable moments.';

  it('drops a reason that restates the description', () => {
    const reasons = ['For night, something deep tends to sit right.', `Everwood — ${description}`];
    expect(withoutEchoes(reasons, description, false)).toEqual(['For night, something deep tends to sit right.']);
  });

  it('keeps reasons that say something the other fields do not', () => {
    const reasons = ['Your signals are elevated, so something lighter.', 'For night, something deep.'];
    expect(withoutEchoes(reasons, description, false)).toHaveLength(2);
  });

  it('drops the note pyramid restated as a sentence when the real pyramid is shown', () => {
    const reasons = ['Opens with bergamot, lemon, ginger, settles into cedarwood.'];
    expect(withoutEchoes(reasons, description, true)).toEqual([]);
  });

  it('keeps that sentence when there is no pyramid to duplicate', () => {
    // Two of the three fragrances publish no pyramid. There, the
    // sentence form is the only note information available and must
    // survive.
    const reasons = ['Opens with bergamot, lemon, ginger, settles into cedarwood.'];
    expect(withoutEchoes(reasons, description, false)).toHaveLength(1);
  });
});

describe('parseLocalDate', () => {
  it('accepts a calendar date and anchors it at UTC midnight', () => {
    expect(parseLocalDate('2026-09-13')?.toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('rejects anything that is not YYYY-MM-DD rather than letting Date guess', () => {
    // `new Date("09/13/2026")` parses, inconsistently across engines.
    for (const bad of ['09/13/2026', '2026-9-13', 'tomorrow', '']) {
      expect(parseLocalDate(bad), bad).toBeNull();
    }
  });
});

describe('startOfLocalDayUtc', () => {
  it('resolves the user’s local date, not the server’s', () => {
    // 02:06 in Chicago is still the 13th; in UTC it is already 07:06 on
    // the 13th too, but at 20:00 Chicago on the 13th UTC has rolled to
    // the 14th — that is the case a naive UTC truncation gets wrong.
    const evening = new Date('2026-09-14T01:00:00Z'); // 20:00 Sep 13 in Chicago
    expect(startOfLocalDayUtc(evening, 'America/Chicago').toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('handles a zone ahead of UTC', () => {
    // 09:00 Sep 14 in Tokyo while UTC is still Sep 13.
    const morning = new Date('2026-09-14T00:00:00Z');
    expect(startOfLocalDayUtc(morning, 'Asia/Tokyo').toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });
});

describe('localMinutesNow', () => {
  it('reports minutes past local midnight', () => {
    expect(localMinutesNow(new Date('2026-09-13T07:06:00Z'), 'America/Chicago')).toBe(2 * 60 + 6);
  });
});
