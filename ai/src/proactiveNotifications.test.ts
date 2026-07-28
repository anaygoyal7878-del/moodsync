import { describe, expect, it } from 'vitest';
import { checkRecoveryUnusuallyHigh, checkRoomTemperatureOutsideSleepRange, checkSceneTimeOfDayPattern } from './proactiveNotifications.js';

describe('checkRecoveryUnusuallyHigh', () => {
  it('returns null with fewer than 5 history points', () => {
    expect(checkRecoveryUnusuallyHigh(90, [50, 55, 52])).toBeNull();
  });

  it('returns null when today is within normal range', () => {
    expect(checkRecoveryUnusuallyHigh(52, [50, 52, 54, 51, 53, 50])).toBeNull();
  });

  it('fires when today is well above the recent baseline', () => {
    const result = checkRecoveryUnusuallyHigh(95, [50, 52, 54, 51, 53, 50]);
    expect(result).not.toBeNull();
    expect(result!.title).toContain('unusually high');
  });
});

describe('checkRoomTemperatureOutsideSleepRange', () => {
  it('returns null when no room name matches "bedroom"', () => {
    const result = checkRoomTemperatureOutsideSleepRange([{ roomName: 'Kitchen', temperatureC: 30 }], { min: 18, max: 21 });
    expect(result).toBeNull();
  });

  it('returns null when the bedroom is within the sleep range', () => {
    const result = checkRoomTemperatureOutsideSleepRange([{ roomName: 'Bedroom', temperatureC: 20 }], { min: 18, max: 21 });
    expect(result).toBeNull();
  });

  it('fires when the bedroom is warmer than the max', () => {
    const result = checkRoomTemperatureOutsideSleepRange([{ roomName: 'Bedroom', temperatureC: 25 }], { min: 18, max: 21 });
    expect(result?.title).toContain('warmer');
  });

  it('fires when the bedroom is cooler than the min', () => {
    const result = checkRoomTemperatureOutsideSleepRange([{ roomName: 'Bedroom', temperatureC: 14 }], { min: 18, max: 21 });
    expect(result?.title).toContain('cooler');
  });
});

describe('checkSceneTimeOfDayPattern', () => {
  it('returns null with fewer than 3 runs for a scene', () => {
    const result = checkSceneTimeOfDayPattern([{ sceneName: 'Focus', hourOfDay: 9 }, { sceneName: 'Focus', hourOfDay: 9 }], 9);
    expect(result).toBeNull();
  });

  it('fires when most runs cluster near the current hour', () => {
    const events = [
      { sceneName: 'Focus', hourOfDay: 9 },
      { sceneName: 'Focus', hourOfDay: 9 },
      { sceneName: 'Focus', hourOfDay: 10 },
      { sceneName: 'Focus', hourOfDay: 20 },
    ];
    const result = checkSceneTimeOfDayPattern(events, 9);
    expect(result?.title).toContain('Focus');
  });

  it('does not fire when runs are scattered with no majority near the current hour', () => {
    const events = [
      { sceneName: 'Focus', hourOfDay: 9 },
      { sceneName: 'Focus', hourOfDay: 14 },
      { sceneName: 'Focus', hourOfDay: 20 },
      { sceneName: 'Focus', hourOfDay: 2 },
    ];
    expect(checkSceneTimeOfDayPattern(events, 9)).toBeNull();
  });
});
