import { describe, expect, it } from 'vitest';
import { computeStressTimeline, describeTimelineEntry } from './stressTimeline.js';

const at = (h: number, m = 0) => new Date(`2026-07-28T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

/** Two samples per 15-minute bucket, which is the minimum the timeline
 * accepts before it will treat a bucket as usable. */
function bucket(hour: number, minute: number, hr: number) {
  return [
    { timestamp: at(hour, minute), heartRate: hr },
    { timestamp: at(hour, minute + 5), heartRate: hr },
  ];
}

describe('computeStressTimeline', () => {
  it('returns an empty timeline with no samples', () => {
    expect(computeStressTimeline([])).toEqual([]);
  });

  it('returns an empty timeline when there are too few usable buckets', () => {
    expect(computeStressTimeline([...bucket(9, 0, 70), ...bucket(9, 30, 90)])).toEqual([]);
  });

  it('returns an empty timeline when heart rate never moves', () => {
    const flat = [...bucket(9, 0, 70), ...bucket(9, 30, 70), ...bucket(10, 0, 70), ...bucket(10, 30, 70)];
    expect(computeStressTimeline(flat)).toEqual([]);
  });

  it('flags a spike against the day baseline', () => {
    const samples = [
      ...bucket(9, 0, 68),
      ...bucket(9, 30, 70),
      ...bucket(10, 0, 69),
      ...bucket(10, 30, 71),
      ...bucket(11, 30, 110),
    ];
    const timeline = computeStressTimeline(samples);
    const spike = timeline.find((e) => e.direction === 'spike');
    expect(spike).toBeDefined();
    expect(spike!.heartRate).toBe(110);
  });

  it('names an overlapping calendar event as the context', () => {
    const samples = [
      ...bucket(9, 0, 68),
      ...bucket(9, 30, 70),
      ...bucket(10, 0, 69),
      ...bucket(10, 30, 71),
      ...bucket(11, 30, 110),
    ];
    const timeline = computeStressTimeline(samples, [{ label: 'Design review', start: at(11, 0), end: at(12, 0) }]);
    expect(timeline.find((e) => e.direction === 'spike')!.context).toBe('Design review');
  });

  it('leaves context null when no event overlaps rather than guessing', () => {
    const samples = [
      ...bucket(9, 0, 68),
      ...bucket(9, 30, 70),
      ...bucket(10, 0, 69),
      ...bucket(10, 30, 71),
      ...bucket(11, 30, 110),
    ];
    const timeline = computeStressTimeline(samples, [{ label: 'Lunch', start: at(13, 0), end: at(14, 0) }]);
    expect(timeline.find((e) => e.direction === 'spike')!.context).toBeNull();
  });
});

describe('describeTimelineEntry', () => {
  it('includes the context when there is one', () => {
    const line = describeTimelineEntry({ at: at(11), direction: 'spike', magnitudeZ: 1.8, heartRate: 110, context: 'Standup' });
    expect(line).toContain('Standup');
  });

  it('describes the movement alone when context is null', () => {
    const line = describeTimelineEntry({ at: at(15), direction: 'drop', magnitudeZ: -1.4, heartRate: 60, context: null });
    expect(line).toBe('Heart rate settled');
  });
});
