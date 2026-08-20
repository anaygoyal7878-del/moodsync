"use client";

import { useState } from "react";
import { Lightbulb, Music, Thermometer, Home, Sparkles, Check, X, Info, Droplet } from "lucide-react";

/**
 * The Adaptive Environment card — the product's answer to the five
 * questions the design brief demands a user can always answer:
 * how am I doing, what does MoodSync think, why, what can I do, and
 * what happens if I accept.
 *
 * The last one is why every proposed change is rendered individually
 * with its own reason and its own actuation label, rather than
 * collapsed behind one "Optimize" button. A user should never tap
 * accept without knowing exactly what will move.
 */

type ActuationMode = "automatic" | "queued_to_device" | "manual_only";

interface ProposedChange {
  channel: "lighting" | "music" | "temperature" | "scene" | "scent";
  summary: string;
  reason: string;
  actuation: ActuationMode;
  from?: number;
  to?: number;
}

interface EnvironmentSnapshot {
  assessment: {
    currentState: string;
    label: string;
    confidence: number;
    supportingSignals: Array<{ kind: "measured" | "contextual"; description: string }>;
    stillLearning: boolean;
    disclaimer: string;
  };
  proposal: { name: string; headline: string; changes: ProposedChange[]; durationMinutes: number | null } | null;
  blockedReason: string | null;
  activeSessionId: string | null;
  findings: string[];
  currentEnvironment: {
    lights: Array<{ name: string; brightnessPct: number | null }>;
    roomTemperatureC: number | null;
    roomName: string | null;
    homeConnected: boolean;
    musicConnected: boolean;
  };
}

const CHANNEL_ICON = {
  lighting: Lightbulb,
  music: Music,
  temperature: Thermometer,
  scene: Home,
  scent: Droplet,
} as const;

/** Actuation is surfaced verbatim, not smoothed over. "MoodSync will
 * do this" and "you'll need to do this" are different promises and the
 * UI must not blur them — see environmentComposer.ts's header for why
 * temperature can only ever be the latter. */
const ACTUATION_LABEL: Record<ActuationMode, string> = {
  automatic: "MoodSync can do this",
  queued_to_device: "Runs when your phone next opens",
  manual_only: "You'll need to change this yourself",
};

function celsiusToF(c: number): number {
  return Math.round(c * 1.8 + 32);
}

export function EnvironmentCard({ snapshot }: { snapshot: EnvironmentSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ applied: string[]; failed: string[] } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const { assessment, proposal, currentEnvironment } = snapshot;

  async function accept() {
    setBusy(true);
    try {
      // A proposal has to exist server-side before it can be accepted —
      // that row is what the outcome measurement later attaches to.
      const created = await fetch("/api/environment/proposals", { method: "POST" });
      if (created.status === 204) return;
      const { session } = (await created.json()) as { session: { id: string } };
      const applied = await fetch(`/api/environment/proposals/${session.id}/accept`, { method: "POST" });
      setResult((await applied.json()) as { applied: string[]; failed: string[] });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      const created = await fetch("/api/environment/proposals", { method: "POST" });
      if (created.status !== 204) {
        const { session } = (await created.json()) as { session: { id: string } };
        await fetch(`/api/environment/proposals/${session.id}/reject`, { method: "POST" });
      }
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="glass-surface metallic-border rounded-2xl p-6"
      style={{ background: "var(--lux-bg-card)" }}
      aria-labelledby="environment-heading"
    >
      {/* --- State hero: how am I doing / what does MoodSync think --- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--lux-muted)" }}>
            Right now
          </p>
          <h2 id="environment-heading" className="mt-1 text-3xl font-medium" style={{ color: "var(--lux-ink)" }}>
            {assessment.label}
          </h2>
          {assessment.stillLearning ? (
            <p className="mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
              Still learning your patterns
            </p>
          ) : (
            <p className="mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
              {Math.round(assessment.confidence * 100)}% confidence
            </p>
          )}
        </div>
        <Sparkles size={20} style={{ color: "var(--lux-gold)" }} aria-hidden />
      </div>

      {/* --- Why: never hidden behind a tooltip, but not shouted either --- */}
      {assessment.supportingSignals.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            style={{ color: "var(--lux-sage)" }}
            aria-expanded={showWhy}
          >
            <Info size={14} aria-hidden />
            {showWhy ? "Hide why" : "Why does MoodSync think this?"}
          </button>
          {showWhy && (
            <ul className="mt-3 space-y-2">
              {assessment.supportingSignals.map((signal) => (
                <li key={signal.description} className="flex items-start gap-2 text-sm" style={{ color: "var(--lux-ink)" }}>
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{
                      background: signal.kind === "measured" ? "rgba(139,168,144,0.18)" : "rgba(201,169,97,0.16)",
                      color: signal.kind === "measured" ? "var(--lux-sage)" : "var(--lux-gold)",
                    }}
                  >
                    {signal.kind}
                  </span>
                  <span>{signal.description}</span>
                </li>
              ))}
            </ul>
          )}
          {showWhy && (
            <p className="mt-3 text-xs" style={{ color: "var(--lux-muted)" }}>
              {assessment.disclaimer}
            </p>
          )}
        </div>
      )}

      {/* --- Current environment --- */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <EnvRow
          icon={Lightbulb}
          label="Lighting"
          value={
            currentEnvironment.lights.length === 0
              ? "No lights connected"
              : currentEnvironment.lights
                  .map((l) => (l.brightnessPct === null ? l.name : `${l.name} ${l.brightnessPct}%`))
                  .join(" · ")
          }
        />
        <EnvRow
          icon={Thermometer}
          label="Temperature"
          value={
            currentEnvironment.roomTemperatureC === null
              ? "No sensor"
              : `${currentEnvironment.roomName ?? "Room"} ${celsiusToF(currentEnvironment.roomTemperatureC)}°F`
          }
        />
        <EnvRow icon={Music} label="Music" value={currentEnvironment.musicConnected ? "Connected" : "Not connected"} />
        <EnvRow icon={Home} label="Apple Home" value={currentEnvironment.homeConnected ? "Connected" : "Not connected"} />
      </div>

      {/* --- Proposal: what can I do / what happens if I accept --- */}
      {proposal && !dismissed && !result && (
        <div className="mt-6 rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
            {proposal.headline}
          </p>
          <ul className="mt-3 space-y-3">
            {proposal.changes.map((change) => {
              const Icon = CHANNEL_ICON[change.channel];
              return (
                <li key={`${change.channel}-${change.summary}`} className="flex items-start gap-3">
                  <Icon size={16} className="mt-0.5 shrink-0" style={{ color: "var(--lux-sage)" }} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: "var(--lux-ink)" }}>
                      {change.summary}
                    </p>
                    <p className="text-xs" style={{ color: "var(--lux-muted)" }}>
                      {change.reason}
                    </p>
                    <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--lux-muted)" }}>
                      {ACTUATION_LABEL[change.actuation]}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="control-press rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--lux-sage)", color: "#0a0b0a", minHeight: 44 }}
            >
              <Check size={15} className="mr-1.5 inline" aria-hidden />
              Create {proposal.name}
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="control-press rounded-lg px-4 py-2.5 text-sm disabled:opacity-60"
              style={{ border: "1px solid var(--lux-muted)", color: "var(--lux-ink)", minHeight: 44 }}
            >
              <X size={15} className="mr-1.5 inline" aria-hidden />
              Not now
            </button>
          </div>
          {proposal.durationMinutes !== null && (
            <p className="mt-2 text-xs" style={{ color: "var(--lux-muted)" }}>
              Suggested for about {proposal.durationMinutes} minutes.
            </p>
          )}
        </div>
      )}

      {/* --- Outcome of an accepted proposal, successes and failures --- */}
      {result && (
        <div className="mt-6 rounded-xl p-4" style={{ background: "var(--lux-bg-card-2)" }}>
          {result.applied.length > 0 && (
            <>
              <p className="text-sm font-medium" style={{ color: "var(--lux-sage)" }}>
                Done
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.applied.map((line) => (
                  <li key={line} className="text-sm" style={{ color: "var(--lux-ink)" }}>
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* A partial failure is shown, not hidden — claiming an
              environment changed when it didn't is worse than saying so. */}
          {result.failed.length > 0 && (
            <>
              <p className="mt-3 text-sm font-medium" style={{ color: "var(--lux-rose)" }}>
                Couldn’t change
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.failed.map((line) => (
                  <li key={line} className="text-sm" style={{ color: "var(--lux-ink)" }}>
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {dismissed && (
        <p className="mt-6 text-sm" style={{ color: "var(--lux-muted)" }}>
          Okay — MoodSync will leave things as they are.
        </p>
      )}

      {!proposal && snapshot.blockedReason && (
        <p className="mt-6 text-sm" style={{ color: "var(--lux-muted)" }}>
          {snapshot.blockedReason}
        </p>
      )}

      {/* --- What MoodSync has learned --- */}
      {snapshot.findings.length > 0 && (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--lux-muted)" }}>
            What MoodSync has learned
          </p>
          <ul className="mt-2 space-y-1">
            {snapshot.findings.map((finding) => (
              <li key={finding} className="text-sm" style={{ color: "var(--lux-ink)" }}>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EnvRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Lightbulb;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--lux-bg-card-2)" }}>
      <Icon size={16} className="shrink-0" style={{ color: "var(--lux-gold)" }} aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--lux-muted)" }}>
          {label}
        </p>
        <p className="truncate text-sm" style={{ color: "var(--lux-ink)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}
