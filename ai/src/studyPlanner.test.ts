import { describe, expect, it } from 'vitest';
import { computeFreeBlocks, computeStudyWindowSuggestion } from './studyPlanner.js';

const day = (h: number, m = 0) => new Date(`2026-07-28T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

describe('computeFreeBlocks', () => {
  it('returns the whole day when there are no busy blocks', () => {
    const free = computeFreeBlocks([], day(9), day(17));
    expect(free).toEqual([{ start: day(9), end: day(17) }]);
  });

  it('splits around a single meeting', () => {
    const free = computeFreeBlocks([{ start: day(11), end: day(12) }], day(9), day(17));
    expect(free).toEqual([
      { start: day(9), end: day(11) },
      { start: day(12), end: day(17) },
    ]);
  });

  it('merges overlapping and back-to-back meetings', () => {
    const free = computeFreeBlocks(
      [
        { start: day(10), end: day(11) },
        { start: day(11), end: day(11, 30) },
        { start: day(10, 45), end: day(12) },
      ],
      day(9),
      day(17),
    );
    expect(free).toEqual([
      { start: day(9), end: day(10) },
      { start: day(12), end: day(17) },
    ]);
  });

  it('clips busy blocks that fall outside the day window', () => {
    const free = computeFreeBlocks([{ start: day(7), end: day(10) }], day(9), day(17));
    expect(free).toEqual([{ start: day(10), end: day(17) }]);
  });
});

describe('computeStudyWindowSuggestion', () => {
  it('returns null when no free block is at least 45 minutes', () => {
    const result = computeStudyWindowSuggestion([{ start: day(10), end: day(10, 30) }], 80);
    expect(result).toBeNull();
  });

  it('picks the longest free block', () => {
    const result = computeStudyWindowSuggestion(
      [
        { start: day(9), end: day(10) },
        { start: day(14), end: day(16, 30) },
      ],
      null,
    );
    expect(result?.start).toEqual(day(14));
  });

  it('caps the suggested window at 2 hours even for a longer free block', () => {
    const result = computeStudyWindowSuggestion([{ start: day(9), end: day(14) }], null);
    expect(result?.start).toEqual(day(9));
    expect(result?.end).toEqual(day(11));
  });

  it('includes an energy-based reason when energy is available', () => {
    const highEnergy = computeStudyWindowSuggestion([{ start: day(14), end: day(16) }], 85);
    expect(highEnergy?.reason).toContain('high');

    const lowEnergy = computeStudyWindowSuggestion([{ start: day(14), end: day(16) }], 20);
    expect(lowEnergy?.reason).toContain('low');
  });
});
