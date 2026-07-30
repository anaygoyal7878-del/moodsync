import { describe, expect, it } from 'vitest';
import { suggestSmartBreak } from './smartBreaks.js';

const base = { elapsedMinutes: 50, earlyHeartRate: null, recentHeartRate: null, minutesSinceLastSuggestion: null };

describe('suggestSmartBreak', () => {
  it('suggests nothing early in a session', () => {
    expect(suggestSmartBreak({ ...base, elapsedMinutes: 20 })).toBeNull();
  });

  it('suggests nothing again too soon after the last prompt', () => {
    expect(suggestSmartBreak({ ...base, elapsedMinutes: 60, minutesSinceLastSuggestion: 5 })).toBeNull();
  });

  it('suggests breathing when heart rate has drifted up', () => {
    const result = suggestSmartBreak({ ...base, elapsedMinutes: 50, earlyHeartRate: 70, recentHeartRate: 80 });
    expect(result!.kind).toBe('breathing');
    expect(result!.reason).toContain('drifted up');
  });

  it('suggests a stretch on a long, settled session', () => {
    const result = suggestSmartBreak({ ...base, elapsedMinutes: 80, earlyHeartRate: 80, recentHeartRate: 70 });
    expect(result!.kind).toBe('stretch');
  });

  it('falls back to a walk on a long session with no heart rate signal', () => {
    const result = suggestSmartBreak({ ...base, elapsedMinutes: 90 });
    expect(result!.kind).toBe('walk');
    expect(result!.reason).toContain('90 minutes');
  });

  it('falls back to water on a moderate session with no heart rate signal', () => {
    expect(suggestSmartBreak({ ...base, elapsedMinutes: 45 })!.kind).toBe('water');
  });

  it('does not treat small heart rate noise as a trend', () => {
    const result = suggestSmartBreak({ ...base, elapsedMinutes: 45, earlyHeartRate: 70, recentHeartRate: 71 });
    expect(result!.kind).toBe('water');
  });
});
