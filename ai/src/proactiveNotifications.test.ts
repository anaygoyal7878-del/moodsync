import { describe, expect, it } from 'vitest';
import {
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  checkBurnoutRisk,
  checkHabitStreakMilestone,
  checkSocialBatteryLow,
  checkRecentStressSpike,
  checkRecoveryEnvironmentConjunction,
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

describe('checkRecentStressSpike', () => {
  const now = new Date('2026-08-15T18:00:00.000Z');

  it('returns null with no entries', () => {
    expect(checkRecentStressSpike([], now, '2:00 PM')).toBeNull();
  });

  it('does not fire when the most recent entry is a drop, not a spike', () => {
    const entries = [{ at: new Date(now.getTime() - 10 * 60_000), direction: 'drop' as const, context: null }];
    expect(checkRecentStressSpike(entries, now, '2:00 PM')).toBeNull();
  });

  it('fires when the most recent entry is a spike within the recency window', () => {
    const entries = [{ at: new Date(now.getTime() - 10 * 60_000), direction: 'spike' as const, context: null }];
    const result = checkRecentStressSpike(entries, now, '5:50 PM');
    expect(result).not.toBeNull();
    expect(result!.title).toContain('5:50 PM');
  });

  it('includes the context event when one overlaps', () => {
    const entries = [{ at: new Date(now.getTime() - 5 * 60_000), direction: 'spike' as const, context: 'Team Standup' }];
    const result = checkRecentStressSpike(entries, now, '5:55 PM');
    expect(result!.body).toContain('Team Standup');
  });

  it('does not fire for a spike that is too old to still be "recent"', () => {
    const entries = [{ at: new Date(now.getTime() - 3 * 60 * 60_000), direction: 'spike' as const, context: null }];
    expect(checkRecentStressSpike(entries, now, '3:00 PM')).toBeNull();
  });

  it('only looks at the most recent entry, ignoring an older spike earlier in the list', () => {
    const entries = [
      { at: new Date(now.getTime() - 4 * 60 * 60_000), direction: 'spike' as const, context: null },
      { at: new Date(now.getTime() - 10 * 60_000), direction: 'drop' as const, context: null },
    ];
    expect(checkRecentStressSpike(entries, now, '5:50 PM')).toBeNull();
  });
});

describe('checkRecoveryEnvironmentConjunction', () => {
  it('stays silent when recovery is unknown', () => {
    expect(checkRecoveryEnvironmentConjunction({ recoveryScore: null, homeEnvironmentScore: 20, calendarBookedHoursToday: 8 })).toBeNull();
  });

  it('stays silent when recovery is fine, regardless of the other two', () => {
    expect(
      checkRecoveryEnvironmentConjunction({ recoveryScore: 80, homeEnvironmentScore: 10, calendarBookedHoursToday: 10 }),
    ).toBeNull();
  });

  it('stays silent on low recovery alone — needs at least one more factor', () => {
    expect(
      checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: null, calendarBookedHoursToday: null }),
    ).toBeNull();
  });

  it('stays silent on low recovery with a fine environment and a light calendar', () => {
    expect(
      checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: 90, calendarBookedHoursToday: 1 }),
    ).toBeNull();
  });

  it('fires on low recovery + poor environment alone', () => {
    const result = checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: 30, calendarBookedHoursToday: null });
    expect(result).not.toBeNull();
    expect(result!.body).toContain("home environment isn't helping");
    expect(result!.body).not.toContain('booked today');
  });

  it('fires on low recovery + a heavy calendar alone', () => {
    const result = checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: null, calendarBookedHoursToday: 7 });
    expect(result).not.toBeNull();
    expect(result!.body).toContain('7.0 hours booked today');
    expect(result!.body).not.toContain("environment isn't helping");
  });

  it('names both factors when both are true', () => {
    const result = checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: 30, calendarBookedHoursToday: 8 });
    expect(result!.body).toContain("environment isn't helping");
    expect(result!.body).toContain('8.0 hours booked today');
  });

  it('treats missing home data as absent, never as poor', () => {
    // homeEnvironmentScore: null must never itself count as a poor
    // score — that would misreport "no HomeKit sensor" as "bad room."
    expect(
      checkRecoveryEnvironmentConjunction({ recoveryScore: 20, homeEnvironmentScore: null, calendarBookedHoursToday: 1 }),
    ).toBeNull();
  });
});
