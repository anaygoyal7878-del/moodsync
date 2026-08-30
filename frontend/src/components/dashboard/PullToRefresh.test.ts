import { describe, it, expect } from "vitest";
import { summarizeSync } from "./PullToRefresh";

/**
 * The summarizer is the whole honesty surface of pull-to-refresh: it's
 * the sentence someone reads to decide whether the numbers on screen are
 * current. Every case below is one where a flat "Refreshed!" would have
 * been either a lie or a false alarm.
 */
describe("summarizeSync", () => {
  it("names a real sync with the row count", () => {
    const result = summarizeSync({
      results: [{ provider: "WHOOP", status: "synced", readingsInserted: 3 }],
      readingsInserted: 3,
      syncedCount: 1,
      failedCount: 0,
    });
    expect(result.tone).toBe("ok");
    expect(result.message).toContain("3 new readings");
  });

  it("uses the singular for exactly one reading", () => {
    const result = summarizeSync({
      results: [{ provider: "WHOOP", status: "synced", readingsInserted: 1 }],
      readingsInserted: 1,
      syncedCount: 1,
      failedCount: 0,
    });
    expect(result.message).toContain("1 new reading.");
  });

  it("says up to date rather than implying new data when a sync found nothing", () => {
    const result = summarizeSync({
      results: [{ provider: "WHOOP", status: "synced", readingsInserted: 0 }],
      readingsInserted: 0,
      syncedCount: 1,
      failedCount: 0,
    });
    expect(result.tone).toBe("ok");
    expect(result.message).toMatch(/up to date/i);
  });

  it("explains that a push-only provider was not pulled, instead of claiming success", () => {
    // The case that matters most. Apple Health cannot be re-pulled from
    // the server at all, so "Refreshed!" would be false the moment the
    // numbers didn't move — and would teach someone to distrust them.
    const result = summarizeSync({
      results: [{ provider: "APPLE_HEALTH", status: "push_only", detail: "…" }],
      readingsInserted: 0,
      syncedCount: 0,
      failedCount: 0,
    });
    expect(result.tone).toBe("ok");
    expect(result.message).toContain("Apple Health");
    expect(result.message).toMatch(/from your device/i);
  });

  it("surfaces a failure by provider name rather than failing silently", () => {
    const result = summarizeSync({
      results: [{ provider: "WHOOP", status: "failed", detail: "token expired" }],
      readingsInserted: 0,
      syncedCount: 0,
      failedCount: 1,
    });
    expect(result.tone).toBe("warn");
    expect(result.message).toContain("WHOOP");
  });

  it("prioritizes a failure over a sibling provider's success", () => {
    // Reporting "2 new readings" while a provider is broken would bury
    // the only part the user can actually act on.
    const result = summarizeSync({
      results: [
        { provider: "WHOOP", status: "synced", readingsInserted: 2 },
        { provider: "GOOGLE_HEALTH", status: "failed", detail: "token expired" },
      ],
      readingsInserted: 2,
      syncedCount: 1,
      failedCount: 1,
    });
    expect(result.tone).toBe("warn");
    // Rendered with the app's real display label, not the raw enum.
    expect(result.message).toContain("Fitbit");
  });

  it("tells someone with nothing connected that there is nothing to refresh", () => {
    const result = summarizeSync({ results: [], readingsInserted: 0, syncedCount: 0, failedCount: 0 });
    expect(result.tone).toBe("warn");
    expect(result.message).toMatch(/no wearable/i);
  });
});
