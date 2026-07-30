import { describe, expect, it } from 'vitest';
import {
  rankPlaylistsByEffect,
  rankGenresByEffect,
  bestHoursForMode,
  buildMusicRecommendations,
  compareFocusDuration,
  describeFocusDuration,
  type CompletedMusicSession,
} from './musicMemory.js';
import type { MusicMode } from './musicFeedback.js';

let dayCounter = 0;
function session(overrides: Partial<CompletedMusicSession> = {}): CompletedMusicSession {
  const startedAt = overrides.startedAt ?? new Date(Date.UTC(2026, 6, 1 + dayCounter++, 14, 0));
  return {
    mode: 'FOCUS',
    itemName: 'Lo-Fi Beats',
    genre: 'Lo-Fi',
    startedAt,
    endedAt: new Date(startedAt.getTime() + 45 * 60_000),
    heartRateDelta: -5,
    endedEarly: false,
    hourOfDay: 14,
    ...overrides,
  };
}

function times(n: number, overrides: Partial<CompletedMusicSession> = {}) {
  return Array.from({ length: n }, () => session(overrides));
}

describe('rankPlaylistsByEffect', () => {
  it('needs at least 3 measured sessions before reporting anything', () => {
    expect(rankPlaylistsByEffect(times(2))).toEqual([]);
  });

  it('ignores sessions whose outcome was insufficient', () => {
    expect(rankPlaylistsByEffect(times(4, { heartRateDelta: null }))).toEqual([]);
  });

  it('marks a falling heart rate as helping a focus playlist', () => {
    const [result] = rankPlaylistsByEffect(times(3));
    expect(result!.helped).toBe(true);
    expect(result!.meanHeartRateDelta).toBe(-5);
    expect(result!.sessions).toBe(3);
  });

  it('marks a falling heart rate as NOT helping a workout playlist', () => {
    const [result] = rankPlaylistsByEffect(times(3, { mode: 'WORKOUT', itemName: 'Gym Hype' }));
    expect(result!.helped).toBe(false);
  });

  it('keeps the same playlist separate per mode', () => {
    const results = rankPlaylistsByEffect([
      ...times(3, { mode: 'FOCUS', heartRateDelta: -6 }),
      ...times(3, { mode: 'SLEEP', heartRateDelta: -2 }),
    ]);
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.mode))).toEqual(new Set(['FOCUS', 'SLEEP']));
  });

  it('sorts the strongest helpful effect first', () => {
    const results = rankPlaylistsByEffect([
      ...times(3, { itemName: 'Weak', heartRateDelta: -2 }),
      ...times(3, { itemName: 'Strong', heartRateDelta: -9 }),
      ...times(3, { itemName: 'Wrong way', heartRateDelta: 8 }),
    ]);
    expect(results.map((r) => r.label)).toEqual(['Strong', 'Weak', 'Wrong way']);
  });

  it('tracks how often the user stops early', () => {
    const [result] = rankPlaylistsByEffect([...times(2, { endedEarly: true }), ...times(2)]);
    expect(result!.earlyStopRate).toBe(0.5);
  });
});

describe('rankGenresByEffect', () => {
  it('skips sessions with no genre rather than bucketing them as unknown', () => {
    expect(rankGenresByEffect(times(4, { genre: null }))).toEqual([]);
  });

  it('groups across different playlists of the same genre', () => {
    const results = rankGenresByEffect([
      ...times(2, { itemName: 'Lo-Fi A' }),
      ...times(2, { itemName: 'Lo-Fi B' }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('Lo-Fi');
    expect(results[0]!.sessions).toBe(4);
  });
});

describe('bestHoursForMode', () => {
  it('drops hours with only one session', () => {
    expect(bestHoursForMode(times(1, { hourOfDay: 9 }), 'FOCUS')).toEqual([]);
  });

  it('ranks calming modes by the biggest drop', () => {
    const results = bestHoursForMode(
      [...times(2, { hourOfDay: 9, heartRateDelta: -2 }), ...times(2, { hourOfDay: 14, heartRateDelta: -8 })],
      'FOCUS',
    );
    expect(results[0]!.hourOfDay).toBe(14);
  });

  it('ranks activating modes by the biggest rise', () => {
    const results = bestHoursForMode(
      [
        ...times(2, { mode: 'WORKOUT', hourOfDay: 7, heartRateDelta: 40 }),
        ...times(2, { mode: 'WORKOUT', hourOfDay: 18, heartRateDelta: 10 }),
      ],
      'WORKOUT',
    );
    expect(results[0]!.hourOfDay).toBe(7);
  });
});

describe('buildMusicRecommendations', () => {
  it('says nothing for a brand new user', () => {
    expect(buildMusicRecommendations([])).toEqual([]);
  });

  it('recommends at most one playlist per mode', () => {
    const recommendations = buildMusicRecommendations([
      ...times(3, { itemName: 'Best', heartRateDelta: -9 }),
      ...times(3, { itemName: 'Also good', heartRateDelta: -4 }),
    ]);
    expect(recommendations.filter((r) => r.mode === 'FOCUS')).toHaveLength(1);
    expect(recommendations[0]!.text).toContain('Best');
  });

  it('never recommends a playlist that moved the wrong way', () => {
    const recommendations = buildMusicRecommendations(times(3, { heartRateDelta: 9 }));
    expect(recommendations.filter((r) => r.text.includes('Lo-Fi Beats'))).toHaveLength(0);
  });

  it('includes the time-of-day pattern when one exists', () => {
    const recommendations = buildMusicRecommendations(times(3, { hourOfDay: 14 }));
    expect(recommendations[0]!.text).toContain('14:00–16:00');
  });

  it('flags a playlist the user keeps abandoning', () => {
    const recommendations = buildMusicRecommendations(times(4, { endedEarly: true, heartRateDelta: -5 }));
    expect(recommendations.some((r) => r.text.includes('stop') && r.text.includes('early'))).toBe(true);
  });

  it('always carries the sample size behind a claim', () => {
    const recommendations = buildMusicRecommendations(times(3));
    expect(recommendations[0]!.sessions).toBe(3);
  });
});

describe('compareFocusDuration', () => {
  const musicStart = new Date(Date.UTC(2026, 6, 1, 14, 0));

  function musicFocusSession(start: Date): CompletedMusicSession {
    return session({ mode: 'FOCUS', startedAt: start, endedAt: new Date(start.getTime() + 90 * 60_000) });
  }

  it('returns null with no focus-mode music sessions', () => {
    expect(compareFocusDuration([{ startedAt: musicStart, durationMinutes: 45 }], [])).toBeNull();
  });

  it('returns null without enough no-music sessions to compare against', () => {
    const music = [musicFocusSession(musicStart)];
    const focus = [{ startedAt: new Date(musicStart.getTime() + 60_000), durationMinutes: 60 }];
    expect(compareFocusDuration(focus, music)).toBeNull();
  });

  it('compares focus length with music against without', () => {
    const musicSessions = [0, 1, 2].map((d) => musicFocusSession(new Date(Date.UTC(2026, 6, 1 + d, 14, 0))));
    const focusSessions = [
      // Three inside a music session, at 60 minutes each.
      ...[0, 1, 2].map((d) => ({ startedAt: new Date(Date.UTC(2026, 6, 1 + d, 14, 10)), durationMinutes: 60 })),
      // Three with nothing playing, at 40 minutes each.
      ...[0, 1, 2].map((d) => ({ startedAt: new Date(Date.UTC(2026, 6, 10 + d, 9, 0)), durationMinutes: 40 })),
    ];

    const comparison = compareFocusDuration(focusSessions, musicSessions)!;
    expect(comparison.label).toBe('Lo-Fi Beats');
    expect(comparison.withMusicMinutes).toBe(60);
    expect(comparison.withoutMusicMinutes).toBe(40);
    expect(comparison.differenceMinutes).toBe(20);
    expect(comparison.sessionsWithMusic).toBe(3);
  });
});

describe('describeFocusDuration', () => {
  it('phrases a positive difference with its sample sizes', () => {
    const line = describeFocusDuration({
      label: 'Lo-Fi Beats',
      withMusicMinutes: 62,
      withoutMusicMinutes: 40,
      differenceMinutes: 22,
      sessionsWithMusic: 4,
      sessionsWithoutMusic: 6,
    });
    expect(line).toBe('You stayed focused 22 minutes longer with "Lo-Fi Beats" (4 sessions vs. 6 without music).');
  });

  it('stays silent rather than claiming a playlist hurt focus', () => {
    const line = describeFocusDuration({
      label: 'Lo-Fi Beats',
      withMusicMinutes: 30,
      withoutMusicMinutes: 45,
      differenceMinutes: -15,
      sessionsWithMusic: 3,
      sessionsWithoutMusic: 5,
    });
    expect(line).toBeNull();
  });
});
