import { describe, expect, it } from 'vitest';
import {
  computeMusicOutcome,
  computeNextNightOutcome,
  confidenceLabel,
  modeWantsLowerHeartRate,
  type MusicMode,
  type MusicSessionWindow,
} from './musicFeedback.js';

const START = new Date('2026-07-30T20:00:00Z');
const END = new Date('2026-07-30T20:30:00Z');

function session(mode: MusicMode, overrides: Partial<MusicSessionWindow> = {}): MusicSessionWindow {
  return { mode, startedAt: START, endedAt: END, itemName: 'Calm Piano', ...overrides };
}

/** `count` samples at `bpm`, spread across the given window. */
function samples(from: Date, to: Date, bpm: number, count = 5) {
  const step = (to.getTime() - from.getTime()) / (count + 1);
  return Array.from({ length: count }, (_, i) => ({ at: new Date(from.getTime() + step * (i + 1)), bpm }));
}

const BEFORE_WINDOW_START = new Date(START.getTime() - 15 * 60_000);

describe('computeMusicOutcome', () => {
  it('reports insufficient for a session shorter than 5 minutes', () => {
    const outcome = computeMusicOutcome(session('RELAX', { endedAt: new Date(START.getTime() + 60_000) }), []);
    expect(outcome.confidence).toBe('insufficient');
    expect(outcome.summary).toContain('too short');
  });

  it('reports insufficient with no heart rate samples rather than inventing a result', () => {
    const outcome = computeMusicOutcome(session('RELAX'), []);
    expect(outcome.confidence).toBe('insufficient');
    expect(outcome.summary).toBe('Not enough heart rate data yet to measure impact.');
    expect(outcome.heartRateDelta).toBeNull();
  });

  it('reports insufficient when only one side of the comparison has samples', () => {
    const outcome = computeMusicOutcome(session('RELAX'), samples(START, END, 60));
    expect(outcome.confidence).toBe('insufficient');
  });

  it('produces the headline sentence for a relaxing session', () => {
    const outcome = computeMusicOutcome(session('RELAX'), [
      ...samples(BEFORE_WINDOW_START, START, 72),
      ...samples(START, END, 65),
    ]);
    expect(outcome.confidence).toBe('measured');
    expect(outcome.heartRateDelta).toBe(-7);
    expect(outcome.summary).toBe('Heart rate dropped 7 BPM during Relax mode.');
  });

  it('treats a rise during a workout as the mode working', () => {
    const outcome = computeMusicOutcome(session('WORKOUT', { itemName: 'Gym Hype' }), [
      ...samples(BEFORE_WINDOW_START, START, 70),
      ...samples(START, END, 120),
    ]);
    expect(outcome.summary).toContain('rose 50 BPM during Workout mode');
    expect(outcome.summary).not.toContain('not the usual direction');
  });

  it('flags a rise during relaxation as against the usual direction', () => {
    const outcome = computeMusicOutcome(session('RELAX'), [
      ...samples(BEFORE_WINDOW_START, START, 65),
      ...samples(START, END, 80),
    ]);
    expect(outcome.summary).toContain('not the usual direction');
  });

  it('says heart rate held steady for a change within normal variation', () => {
    const outcome = computeMusicOutcome(session('FOCUS'), [
      ...samples(BEFORE_WINDOW_START, START, 70),
      ...samples(START, END, 71),
    ]);
    expect(outcome.summary).toContain('held steady');
    expect(outcome.heartRateDelta).toBe(1);
  });

  it('always explains what was compared and never claims causation', () => {
    const outcome = computeMusicOutcome(session('RELAX'), [
      ...samples(BEFORE_WINDOW_START, START, 72),
      ...samples(START, END, 65),
    ]);
    expect(outcome.explanation.itemName).toBe('Calm Piano');
    expect(outcome.explanation.metric).toBe('Average heart rate');
    expect(outcome.explanation.comparedWindows).toContain('15 min before');
    expect(outcome.explanation.caveat).toContain('not what caused what');
  });

  it('carries the insufficient caveat when nothing could be compared', () => {
    const outcome = computeMusicOutcome(session('RELAX'), []);
    expect(outcome.explanation.metric).toBeNull();
    expect(outcome.explanation.caveat).toContain('Not enough readings');
  });
});

describe('modeWantsLowerHeartRate', () => {
  it('wants a lower heart rate for calming modes', () => {
    for (const mode of ['RELAX', 'SLEEP', 'RECOVERY', 'FOCUS'] as MusicMode[]) {
      expect(modeWantsLowerHeartRate(mode)).toBe(true);
    }
  });

  it('wants a higher heart rate for activating modes', () => {
    expect(modeWantsLowerHeartRate('WORKOUT')).toBe(false);
    expect(modeWantsLowerHeartRate('MORNING')).toBe(false);
  });
});

describe('computeNextNightOutcome', () => {
  const base = { mode: 'SLEEP' as MusicMode, itemName: 'Calm Piano', sleepScoreAfter: 85, sleepScoreBaseline: 70 };

  it('only applies to sleep and recovery modes', () => {
    expect(computeNextNightOutcome({ ...base, mode: 'WORKOUT' })).toBeNull();
    expect(computeNextNightOutcome({ ...base, mode: 'RECOVERY' })).not.toBeNull();
  });

  it('returns null without both a score and a baseline', () => {
    expect(computeNextNightOutcome({ ...base, sleepScoreAfter: null })).toBeNull();
    expect(computeNextNightOutcome({ ...base, sleepScoreBaseline: null })).toBeNull();
  });

  it('says nothing about a typical night', () => {
    expect(computeNextNightOutcome({ ...base, sleepScoreAfter: 72 })).toBeNull();
  });

  it('is labelled an interpretation, never a measurement', () => {
    const outcome = computeNextNightOutcome(base)!;
    expect(outcome.confidence).toBe('interpretation');
    expect(outcome.summary).toContain('15 points better');
    expect(outcome.explanation.caveat).toContain('not a direct measurement');
  });

  it('reports a worse night honestly', () => {
    const outcome = computeNextNightOutcome({ ...base, sleepScoreAfter: 55 })!;
    expect(outcome.summary).toContain('below your average');
  });
});

describe('confidenceLabel', () => {
  it('gives the three badge labels', () => {
    expect(confidenceLabel('measured')).toBe('Measured change');
    expect(confidenceLabel('interpretation')).toBe('AI interpretation');
    expect(confidenceLabel('insufficient')).toBe('Not enough data yet');
  });
});

describe('computeMusicOutcome — start-versus-end fallback', () => {
  const at = (min: number) => new Date(START.getTime() + min * 60_000);

  it('measures start against end when nothing was recorded before the session', () => {
    // Samples only exist once the session is running — the common case.
    // Previously this was always "not enough data".
    const readings = [2, 4, 6, 8, 10, 12, 18, 20, 22, 24, 26, 28].map((m, i) => ({ at: at(m), bpm: i < 6 ? 78 : 69 }));
    const outcome = computeMusicOutcome(session('RELAX'), readings);
    expect(outcome.confidence).toBe('measured');
    expect(outcome.heartRateDelta).toBe(-9);
    expect(outcome.explanation.comparedWindows).toBe('The opening third of the session vs. its closing third');
  });

  it('prefers the before-window comparison when one exists', () => {
    const outcome = computeMusicOutcome(session('RELAX'), [
      ...samples(BEFORE_WINDOW_START, START, 80),
      ...samples(START, END, 70),
    ]);
    expect(outcome.explanation.comparedWindows).toMatch(/before vs\. the/);
  });

  it('stays insufficient when in-session samples are too few', () => {
    const outcome = computeMusicOutcome(session('RELAX'), [at(2), at(10), at(20), at(28)].map((d) => ({ at: d, bpm: 70 })));
    expect(outcome.confidence).toBe('insufficient');
  });

  it('stays insufficient when the samples are bunched into a few minutes', () => {
    // Nine readings within three minutes: "start" and "end" are the same moment.
    const bunched = Array.from({ length: 9 }, (_, i) => ({ at: new Date(START.getTime() + 60_000 + i * 20_000), bpm: 70 + i }));
    expect(computeMusicOutcome(session('RELAX'), bunched).confidence).toBe('insufficient');
  });
});
