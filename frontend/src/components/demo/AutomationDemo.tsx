"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export interface DemoChip {
  label: string;
  /** Falsy (null/undefined) renders the chip in its dim, "no change yet" state. */
  value?: string | null;
}

export interface DemoStep {
  caption: string;
  /** 0-100, drives the metric bar + number */
  metricValue: number;
  /** true once the metric is in the range that trips the rule — flips the metric to the brand accent color */
  alert: boolean;
  ruleMatched: boolean;
  /** The animated light orb — omit entirely for a scenario that doesn't touch lighting. */
  light?: { on: boolean; warm: boolean; brightness: number } | null;
  /** Any other device/signal rows (Spotify, notifications, locks, thermostat, scent, calendar...). */
  chips?: DemoChip[];
  logged: boolean;
}

export interface DemoScenario {
  id: string;
  emoji: string;
  title: string;
  description: string;
  metricLabel: string;
  ruleLabel: string;
  deviceLabel: string;
  steps: DemoStep[];
  /** Set for scenarios that showcase a capability MoodSync doesn't build against
   * yet (no real API integration exists) — rendered with a clear "Concept" badge
   * so the demo can show product vision without claiming it ships today. */
  concept?: boolean;
}

const STEP_DURATION_MS = 3200;

/**
 * Generic, self-contained walkthrough controller — each instance owns its
 * own step/autoplay state, so multiple scenarios can run independently on
 * the same page without stepping on each other. Visual structure (metric
 * card + home reaction card + log + step dots + back/play/next) is shared
 * across every scenario; only the data differs.
 */
export function AutomationDemo({ scenario }: { scenario: DemoScenario }) {
  const { steps, metricLabel, ruleLabel, deviceLabel } = scenario;
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotionRef.current) setAutoPlay(false);
  }, []);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % steps.length), STEP_DURATION_MS);
    return () => clearInterval(timer);
  }, [autoPlay, steps.length]);

  const step = steps[index]!;
  const chipLabels = Array.from(new Set(steps.flatMap((s) => (s.chips ?? []).map((c) => c.label))));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Metric card */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-xs uppercase tracking-wide text-ink-muted">{metricLabel}</p>
          <p
            className="mt-2 text-4xl font-semibold tabular-nums transition-colors duration-700"
            style={{ color: step.alert ? "#ff9075" : "#f5f1ec" }}
          >
            {step.metricValue}%
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${step.metricValue}%`, backgroundColor: step.alert ? "#ff7a59" : "#726a80" }}
            />
          </div>
          <p
            className={`mt-4 rounded-lg border px-3 py-2 text-xs transition-all duration-500 ${
              step.ruleMatched ? "border-brand/40 bg-brand/10 text-ink" : "border-line text-ink-muted opacity-60"
            }`}
          >
            Rule: {ruleLabel} {step.ruleMatched && "· matched"}
          </p>
        </div>

        {/* Home reaction card */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Your home</p>

          {step.light && (
            <div className="mt-3 flex items-center gap-4">
              <div
                className="h-12 w-12 shrink-0 rounded-full transition-all duration-700"
                style={{
                  backgroundColor: step.light.warm ? "#ffb37a" : "#f5f1ec",
                  opacity: step.light.brightness / 100,
                  boxShadow: step.light.on
                    ? `0 0 ${step.light.brightness / 2.5}px ${step.light.brightness / 6}px ${step.light.warm ? "#ffb37a55" : "#f5f1ec55"}`
                    : "none",
                }}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{deviceLabel}</p>
                <p className="text-xs text-ink-muted">
                  {step.light.warm ? `Warm · ${step.light.brightness}% brightness` : `Bright · ${step.light.brightness}% brightness`}
                </p>
              </div>
            </div>
          )}

          {chipLabels.map((label) => {
            const chip = step.chips?.find((c) => c.label === label);
            return (
              <div
                key={label}
                className={`mt-3 flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-500 ${
                  chip?.value ? "border-line-strong bg-surface-raised opacity-100" : "border-line opacity-40"
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <div>
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="text-sm font-medium">{chip?.value ?? "No change yet"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Automation log */}
      <div
        className={`rounded-2xl border px-4 py-3 text-sm transition-all duration-500 ${
          step.logged ? "border-brand/30 bg-brand/5 text-ink opacity-100" : "border-line text-ink-muted opacity-50"
        }`}
      >
        {step.logged ? (
          <span>
            <span className="font-medium">{ruleLabel}</span> · Executed · just now
          </span>
        ) : (
          "Automation history entry will appear here once a rule fires."
        )}
      </div>

      {/* Caption + controls */}
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="min-h-6 text-sm text-ink-secondary">{step.caption}</p>

        <div className="flex items-center gap-1.5" role="tablist" aria-label={`${scenario.title} demo steps`}>
          {steps.map((s, i) => (
            <button
              key={s.caption}
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}`}
              onClick={() => {
                setIndex(i);
                setAutoPlay(false);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-brand" : "w-1.5 bg-line-strong hover:bg-ink-muted"}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setIndex((i) => (i - 1 + steps.length) % steps.length);
              setAutoPlay(false);
            }}
          >
            Back
          </Button>
          <Button variant="secondary" onClick={() => setAutoPlay((p) => !p)}>
            {autoPlay ? "Pause" : "Play"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setIndex((i) => (i + 1) % steps.length);
              setAutoPlay(false);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
