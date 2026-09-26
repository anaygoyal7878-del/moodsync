import { ArrowDown, ArrowUp, Minus, HelpCircle, ShieldCheck } from "lucide-react";
import type { RecoveryContextResponse } from "@/lib/types";

/**
 * Recovery Intelligence — the state, the signals behind it, and the
 * evidence behind those.
 *
 * Built around one question: *why am I seeing this?* A recovery verdict
 * a person cannot interrogate is one they can only obey or ignore, and
 * most people pick ignore. So every layer is visible in order: what
 * MoodSync concluded, how sure it is and why, which readings produced
 * it.
 *
 * The thresholds come from the evidence register in
 * ai/src/evidenceSources.ts, which is what the logic is built on. The
 * sources are deliberately not rendered here: the screen explains the
 * reasoning in the person's own numbers, and a bibliography under a
 * recovery card is reading material nobody asked for.
 *
 * The signal rows are deliberately unflashy. Each shows the reading, an
 * arrow, and a comparison against that person's own range — never
 * against a population number, because absolute HRV varies several-fold
 * between healthy adults and between devices.
 *
 * Confidence is shown even when it is high. A system that mentions
 * uncertainty only when uncertain has taught its users that silence
 * means certainty, which is a worse default than saying so every time.
 */

const STATE_ACCENT: Record<string, string> = {
  "recovering-well": "var(--lux-sage)",
  normal: "var(--lux-sage)",
  "higher-need": "var(--gold)",
  priority: "var(--gold-bright)",
  "insufficient-data": "var(--lux-muted)",
};

const STATE_BORDER: Record<string, string> = {
  "recovering-well": "var(--lux-hairline)",
  normal: "var(--lux-hairline)",
  "higher-need": "var(--lux-hairline-gold)",
  priority: "var(--lux-hairline-gold)",
  "insufficient-data": "var(--lux-hairline)",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
};

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "above") return <ArrowUp size={13} aria-hidden="true" />;
  if (direction === "below") return <ArrowDown size={13} aria-hidden="true" />;
  if (direction === "typical") return <Minus size={13} aria-hidden="true" />;
  return <HelpCircle size={13} aria-hidden="true" />;
}

export function RecoveryIntelligence({ context }: { context: RecoveryContextResponse }) {
  const accent = STATE_ACCENT[context.state] ?? "var(--lux-sage)";
  const border = STATE_BORDER[context.state] ?? "var(--lux-hairline)";

  return (
    <section
      className="relative overflow-hidden rounded-[24px] p-5"
      style={{ background: "var(--lux-bg-card)", border: `1px solid ${border}`, boxShadow: "var(--elev-2)" }}
    >
      <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: accent }}>
        Recovery
      </p>
      <h2 className="font-luxury-display mt-1 text-[19px] font-semibold leading-tight" style={{ color: "var(--lux-ink)" }}>
        {context.headline}
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
        {context.guidance}
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-[14px] px-3 py-2.5" style={{ background: "var(--lux-bg-card-2)" }}>
        <ShieldCheck size={13} style={{ color: accent }} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="text-[12px] leading-snug" style={{ color: "var(--lux-muted)" }}>
          <span style={{ color: "var(--lux-ink)" }}>{CONFIDENCE_LABEL[context.confidence] ?? "Confidence"}</span> —{" "}
          {context.confidenceReason}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
          Why am I seeing this?
        </p>
        <ul className="mt-2 flex flex-col">
          {context.signals.map((signal, index) => (
            <li
              key={signal.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
              style={index === 0 ? undefined : { borderTop: "1px solid var(--lux-hairline)" }}
            >
              <span className="w-[108px] shrink-0 text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
                {signal.label}
              </span>
              <span
                className="tabular w-[70px] shrink-0 text-[13.5px] font-medium"
                style={{ color: signal.value ? "var(--lux-ink)" : "var(--lux-muted)" }}
              >
                {signal.value ?? "—"}
              </span>
              <span
                className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[12.5px]"
                style={{ color: signal.suggestsRecovery === true ? "var(--gold)" : "var(--lux-muted)" }}
              >
                <DirectionIcon direction={signal.direction} />
                <span className="min-w-0">{signal.comparison}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
        Based on your own recent readings, not population averages. Wearable sensors estimate heart rate and HRV
        optically, which is not the same as a clinical ECG — these are suggestions from your trends, not a medical
        assessment.
      </p>
    </section>
  );
}
