import { describe, expect, it } from 'vitest';
import {
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  checkBurnoutRisk,
  checkHabitStreakMilestone,
  checkSocialBatteryLow,
} from './proactiveNotifications.js';

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

describe('checkBurnoutRisk', () => {
  it('returns null when sleep or recovery data is missing', () => {
    expect(checkBurnoutRisk({ sleepScore: null, recoveryScore: 30, restingHeartRateZ: 2, calendarEventCountToday: 8 })).toBeNull();
    expect(checkBurnoutRisk({ sleepScore: 30, recoveryScore: null, restingHeartRateZ: 2, calendarEventCountToday: 8 })).toBeNull();
  });

  it('returns null when sleep and recovery are both fine, regardless of other signals', () => {
    const result = checkBurnoutRisk({ sleepScore: 80, recoveryScore: 80, restingHeartRateZ: 3, calendarEventCountToday: 10 });
    expect(result).toBeNull();
  });

  it('returns null when sleep and recovery are poor but no secondary signal confirms it', () => {
    const result = checkBurnoutRisk({ sleepScore: 30, recoveryScore: 25, restingHeartRateZ: null, calendarEventCountToday: null });
    expect(result).toBeNull();
  });

  it('returns null when sleep/recovery are poor but secondary signals are normal', () => {
    const result = checkBurnoutRisk({ sleepScore: 30, recoveryScore: 25, restingHeartRateZ: 0.2, calendarEventCountToday: 2 });
    expect(result).toBeNull();
  });

  it('fires when poor sleep, low recovery, and elevated heart rate all agree', () => {
    const result = checkBurnoutRisk({ sleepScore: 30, recoveryScore: 25, restingHeartRateZ: 1.5, calendarEventCountToday: null });
    expect(result).not.toBeNull();
    expect(result!.title).toContain('burnout');
    expect(result!.body).toContain('elevated heart rate');
  });

  it('fires when poor sleep, low recovery, and an overloaded calendar all agree', () => {
    const result = checkBurnoutRisk({ sleepScore: 30, recoveryScore: 25, restingHeartRateZ: null, calendarEventCountToday: 8 });
    expect(result).not.toBeNull();
    expect(result!.body).toContain('heavily-booked calendar');
  });
});

describe('checkHabitStreakMilestone', () => {
  it('does not fire for a non-milestone streak length', () => {
    expect(checkHabitStreakMilestone('walking', 4)).toBeNull();
    expect(checkHabitStreakMilestone('meditation', 0)).toBeNull();
  });

  it('fires exactly on milestone values', () => {
    const result = checkHabitStreakMilestone('meditation', 7);
    expect(result).not.toBeNull();
    expect(result!.title).toContain('7-day');
    expect(result!.title).toContain('Meditation');
  });

  it('uses the right label per habit', () => {
    expect(checkHabitStreakMilestone('walking', 30)!.title).toContain('Morning Walks');
    expect(checkHabitStreakMilestone('focus', 30)!.title).toContain('Focus');
  });

  it('does not fire again the day after a milestone (streak moved past it)', () => {
    expect(checkHabitStreakMilestone('walking', 8)).toBeNull();
  });
});

describe('checkSocialBatteryLow', () => {
  it('returns null when there is no social battery result at all', () => {
    expect(checkSocialBatteryLow(null)).toBeNull();
  });

  it('does not fire for medium or high levels', () => {
    expect(checkSocialBatteryLow({ level: 'medium', reasons: [] })).toBeNull();
    expect(checkSocialBatteryLow({ level: 'high', reasons: [] })).toBeNull();
  });

  it('fires for a low level and includes the top reason', () => {
    const result = checkSocialBatteryLow({ level: 'low', reasons: ['your recovery is low today', 'you slept poorly'] });
    expect(result).not.toBeNull();
    expect(result!.body).toContain('your recovery is low today');
  });

  it('still fires for a low level with no stated reason', () => {
    const result = checkSocialBatteryLow({ level: 'low', reasons: [] });
    expect(result).not.toBeNull();
  });
});
