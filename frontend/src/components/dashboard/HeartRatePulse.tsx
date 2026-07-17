"use client";

import { HeartPulse } from "lucide-react";
import type { NormalizedBiometricReading } from "@moodsync/shared";

/** Pure CSS pulse (no framer-motion, matching the rest of this app's
 * animation approach) — beat duration derives from the real reading's
 * heartRate, same convention as the reduced-motion gating already used
 * for `animate-fade-in-up` elsewhere in this file tree. */
export function HeartRatePulse({ latest }: { latest: NormalizedBiometricReading | null }) {
  const heartRate = latest?.heartRate;
  if (heartRate === undefined) return null;

  const beatSeconds = 60 / heartRate;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <span
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand motion-safe:animate-[heart-pulse_var(--beat-duration)_ease-in-out_infinite]"
        style={{ "--beat-duration": `${beatSeconds}s` } as React.CSSProperties}
      >
        <HeartPulse className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="flex items-baseline gap-1.5 text-2xl font-semibold tabular-nums">
          {heartRate}
          <span className="text-sm font-normal text-ink-secondary">bpm</span>
        </p>
        <p className="text-xs text-ink-muted">
          Live from {latest?.provider}
          {latest?.restingHeartRate !== undefined ? ` · resting ${latest.restingHeartRate} bpm` : ""}
        </p>
      </div>
    </div>
  );
}
