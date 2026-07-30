import { describe, expect, it } from 'vitest';
import {
  composeDailyBrief,
  computeOvernightChanges,
  computeReadiness,
  greetingFor,
  readinessBand,
  timeOfDayFor,
  type DailyBriefInput,
} from './dailyBrief.js';

const score = (value: number | null) => ({ value, basis: 'heuristic' as const });

describe('timeOfDayFor / greetingFor', () => {
  it('buckets the clock into parts of the day', () => {
    expect(timeOfDayFor(2)).toBe('night');
    expect(timeOfDayFor(9)).toBe('morning');
    expect(timeOfDayFor(14)).toBe('afternoon');
    expect(timeOfDayFor(19)).toBe('evening');
    expect(timeOfDayFor(23)).toBe('night');
  });

  it('personalizes the greeting when a name is known', () => {
    expect(greetingFor('morning', 'Anay')).toBe('Good morning, Anay');
    expect(greetingFor('morning', null)).toBe('Good morning');
  });
});

describe('computeReadiness', () => {
  it('returns null with neither recovery nor sleep', () => {
    expect(computeReadiness({ recovery: score(null), sleep: score(null) }).value).toBeNull();
  });

  it('weights recovery above sleep', () => {
    expect(computeReadiness({ recovery: score(100), sleep: score(0) }).value).toBe(60);
    expect(computeReadiness({ recovery: score(0), sleep: score(100) }).value).toBe(40);
  });

  it('redistributes weight when only one input exists', () => {
    expect(computeReadiness({ recovery: score(80), sleep: score(null) }).value).toBe(80);
  });

  it('bands the score', () => {
    expect(readinessBand(80)).toBe('primed');
    expect(readinessBand(50)).toBe('steady');
    expect(readinessBand(20)).toBe('depleted');
  });
});

describe('computeOvernightChanges', () => {
  it('reports nothing when the night was typical', () => {
    expect(computeOvernightChanges({ sleep: 72, recovery: 68 }, { sleep: 70, recovery: 70 })).toEqual([]);
  });

  it('reports a better night against the user own average', () => {
    const changes = computeOvernightChanges({ sleep: 85, recovery: null }, { sleep: 70, recovery: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.delta).toBe(15);
    expect(changes[0]!.sentence).toContain('better');
  });

  it('reports a worse recovery morning', () => {
    const changes = computeOvernightChanges({ sleep: null, recovery: 40 }, { sleep: null, recovery: 70 });
    expect(changes[0]!.sentence).toContain('below your average');
  });

  it('orders the biggest change first', () => {
    const changes = computeOvernightChanges({ sleep: 78, recovery: 40 }, { sleep: 70, recovery: 70 });
    expect(changes[0]!.metric).toBe('recovery');
  });

  it('reports nothing when a metric has no baseline to compare against', () => {
    expect(computeOvernightChanges({ sleep: 90, recovery: null }, { sleep: null, recovery: null })).toEqual([]);
  });
});

describe('composeDailyBrief', () => {
  const base: DailyBriefInput = {
    timeOfDay: 'morning',
    readiness: 70,
    energy: 70,
    burnoutRisk: false,
    focusWindow: null,
    bookedHoursToday: null,
  };

  it('lets burnout risk override everything else', () => {
    const brief = composeDailyBrief({ ...base, readiness: 90, burnoutRisk: true });
    expect(brief.focusToday).toContain('Protecting your baseline');
    expect(brief.avoidToday).toContain('Hard training');
    expect(brief.actions[0]!.kind).toBe('recovery');
  });

  it('steers a depleted morning toward a lighter day', () => {
    const brief = composeDailyBrief({ ...base, readiness: 25 });
    expect(brief.focusToday).toContain('lighter day');
    expect(brief.actions[0]!.reason).toContain('25');
  });

  it('steers the evening toward sleep', () => {
    const brief = composeDailyBrief({ ...base, timeOfDay: 'evening' });
    expect(brief.actions[0]!.kind).toBe('wind-down');
    expect(brief.focusToday).toContain('Sleep');
  });

  it('warns about late caffeine only when evening energy is still high', () => {
    expect(composeDailyBrief({ ...base, timeOfDay: 'evening', energy: 80 }).avoidToday).toContain('Late caffeine');
    expect(composeDailyBrief({ ...base, timeOfDay: 'evening', energy: 30 }).avoidToday).toBeNull();
  });

  it('names a real calendar-backed focus window when one exists', () => {
    const brief = composeDailyBrief({
      ...base,
      focusWindow: { start: new Date('2026-07-28T14:00:00Z'), end: new Date('2026-07-28T16:00:00Z') },
    });
    expect(brief.actions[0]!.kind).toBe('focus');
    expect(brief.actions[0]!.label).toContain('–');
  });

  it('flags an overloaded day and suggests protecting a gap', () => {
    const brief = composeDailyBrief({ ...base, bookedHoursToday: 7 });
    expect(brief.avoidToday).toContain('already full');
    expect(brief.actions.some((a) => a.kind === 'plan')).toBe(true);
  });

  it('encourages depth on a primed day', () => {
    expect(composeDailyBrief({ ...base, readiness: 85 }).focusToday).toContain('hardest work');
  });

  it('always produces at least one action', () => {
    expect(composeDailyBrief({ ...base, readiness: null, energy: null }).actions.length).toBeGreaterThan(0);
  });
});
