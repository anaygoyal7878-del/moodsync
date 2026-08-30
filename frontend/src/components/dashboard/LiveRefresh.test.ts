import { describe, it, expect } from "vitest";
import { shouldRefresh, REFRESH_INTERVAL_MS } from "./LiveRefresh";

/**
 * `shouldRefresh` is the entire policy: when the dashboard is allowed to
 * re-render itself without being asked. Both ways of getting it wrong
 * are user-visible — too eager drains a phone re-rendering numbers that
 * did not change, too lazy shows someone yesterday's recommendation and
 * lets them act on it.
 */
describe("shouldRefresh", () => {
  const now = 1_700_000_000_000;

  it("refreshes once the interval has elapsed on a visible tab", () => {
    expect(shouldRefresh({ hidden: false, lastRefreshedAt: now - REFRESH_INTERVAL_MS, now })).toBe(true);
  });

  it("does not refresh before the interval — the data upstream has not changed yet", () => {
    // The sync worker only produces new rows every five minutes, so a
    // refresh at four would re-render identical numbers.
    expect(shouldRefresh({ hidden: false, lastRefreshedAt: now - (REFRESH_INTERVAL_MS - 1), now })).toBe(false);
  });

  it("never refreshes a hidden tab, however long it has been", () => {
    // A backgrounded phone re-rendering the dashboard every five minutes
    // is pure battery cost: nobody is reading it, and coming back to the
    // tab triggers its own check.
    expect(shouldRefresh({ hidden: true, lastRefreshedAt: now - REFRESH_INTERVAL_MS * 100, now })).toBe(false);
  });

  it("refreshes immediately for a tab that was hidden past the interval and is now visible", () => {
    // The phone-out-of-pocket case, and the one people actually feel.
    // The same call that returns false while hidden must return true the
    // instant visibility flips, rather than waiting for the next tick.
    const hiddenFor = { lastRefreshedAt: now - REFRESH_INTERVAL_MS * 3, now };
    expect(shouldRefresh({ hidden: true, ...hiddenFor })).toBe(false);
    expect(shouldRefresh({ hidden: false, ...hiddenFor })).toBe(true);
  });

  it("does not refresh on a visibility change that happened well inside the interval", () => {
    // Tabbing away and straight back is not a reason to refetch.
    expect(shouldRefresh({ hidden: false, lastRefreshedAt: now - 1_000, now })).toBe(false);
  });

  it("is pinned to the five-minute cadence of the sync worker that produces the data", () => {
    // If the sync-all cron changes, this assertion is the thing that
    // should force someone to reconsider the interval rather than
    // letting the two drift apart silently.
    expect(REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});
