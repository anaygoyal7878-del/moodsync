"use client";

import { useState } from "react";
import { Section } from "./CompanionPrimitives";
import { Brain } from "lucide-react";

/**
 * The self-report that makes ai/src/affectModel.ts possible at all.
 *
 * Shaped as a tappable 5x5 grid — valence (unpleasant→pleasant) on the
 * x-axis, arousal (calm→activated) on the y-axis — rather than two
 * sliders or a mood-word picker, for a reason that isn't aesthetic:
 * **the grid *is* the storage format.** `MoodCheckIn.valence` and
 * `.arousal` are each an integer -2..+2; a slider that reported a
 * smooth 0-100 would invent precision the model was never designed to
 * use, and a word picker ("stressed", "content") would require a
 * mapping table this project has deliberately avoided everywhere else
 * (see stateEngine.ts's ban on diagnostic vocabulary). One tap, one
 * exact label.
 *
 * Quadrant tinting follows the standard circumplex-derived "mood
 * meter" convention (Brackett et al.): high-arousal-unpleasant reads
 * warm/red, high-arousal-pleasant warm/yellow, low-arousal-unpleasant
 * cool/blue, low-arousal-pleasant cool/green. This is a widely used
 * layout in affective science outreach, not a MoodSync invention.
 */

const SCALE = [-2, -1, 0, 1, 2] as const;

const VALENCE_LABELS: Record<number, string> = {
  [-2]: "Unpleasant",
  [2]: "Pleasant",
};
const AROUSAL_LABELS: Record<number, string> = {
  [-2]: "Calm",
  [2]: "Activated",
};

/** Quadrant fill, interpolated toward the centre so the grid reads as
 * one continuous field rather than four hard-edged tiles — the
 * circumplex is continuous even though the report is discrete. */
function cellColor(valence: number, arousal: number): string {
  const warmth = arousal >= 0 ? "255, 196, 92" : "108, 155, 235"; // activated=warm, calm=cool
  const lean = valence >= 0 ? "126, 199, 143" : "224, 110, 110"; // pleasant=green, unpleasant=red
  const t = (Math.abs(valence) + Math.abs(arousal)) / 4; // 0 at centre, 1 at corners
  const opacity = 0.12 + t * 0.28;
  return `linear-gradient(135deg, rgba(${warmth}, ${opacity}), rgba(${lean}, ${opacity}))`;
}

export function MoodCheckInGrid({ onSaved }: { onSaved?: () => void }) {
  const [valence, setValence] = useState<number | null>(null);
  const [arousal, setArousal] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = valence !== null && arousal !== null;

  async function submit() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/affect/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valence, arousal, note: note.trim() || null }),
      });
      if (!res.ok) {
        setError("Couldn't save that just now.");
        return;
      }
      setSaved(true);
      setValence(null);
      setArousal(null);
      setNote("");
      onSaved?.();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Couldn't reach MoodSync just now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="How are you, right now?" subtitle="Tap where this moment sits. Takes five seconds." icon={Brain}>
      <div className="relative">
        <div
          className="grid gap-1 rounded-2xl p-2"
          style={{ gridTemplateColumns: "repeat(5, 1fr)", background: "var(--lux-bg-card-2)" }}
        >
          {/* Row order: arousal +2 (top) down to -2 (bottom). */}
          {[...SCALE].reverse().map((a) =>
            SCALE.map((v) => {
              const isPicked = valence === v && arousal === a;
              return (
                <button
                  key={`${v}-${a}`}
                  type="button"
                  aria-label={`Valence ${v}, arousal ${a}`}
                  onClick={() => {
                    setValence(v);
                    setArousal(a);
                  }}
                  className="aspect-square rounded-lg transition-transform"
                  style={{
                    background: cellColor(v, a),
                    border: isPicked ? "2px solid var(--lux-ink)" : "1px solid transparent",
                    transform: isPicked ? "scale(1.08)" : undefined,
                  }}
                />
              );
            }),
          )}
        </div>

        {/* Axis labels, outside the grid so they never eat a cell. */}
        <div
          className="mt-1 flex justify-between px-1 text-[11px]"
          style={{ color: "var(--lux-muted)" }}
        >
          <span>{VALENCE_LABELS[-2]}</span>
          <span>{VALENCE_LABELS[2]}</span>
        </div>
        <div
          className="pointer-events-none absolute -left-2 top-0 flex h-full -translate-x-full flex-col justify-between py-2 text-right text-[11px]"
          style={{ color: "var(--lux-muted)" }}
        >
          <span>{AROUSAL_LABELS[2]}</span>
          <span>{AROUSAL_LABELS[-2]}</span>
        </div>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note — just for you, never used to train anything"
        maxLength={280}
        className="mt-5 w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={!picked || saving}
        className="mt-3 w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
        style={{ background: "var(--lux-sage)", color: "var(--lux-bg)" }}
      >
        {saving ? "Saving…" : "Log this"}
      </button>

      <p aria-live="polite" className="mt-2 text-xs" style={{ color: "var(--lux-muted)" }}>
        {error ?? (saved ? "Logged." : " ")}
      </p>
    </Section>
  );
}
