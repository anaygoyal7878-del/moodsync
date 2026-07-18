import { Card } from "@/components/ui/Card";
import { metricLabel } from "@/lib/metrics";
import type { WellnessScores, ScoreBasis } from "@/lib/types";

const SCORE_ORDER: Array<keyof WellnessScores> = ["overall", "stress", "recovery", "sleep", "energy", "fatigue", "focus", "relaxation"];

/** Distinguishes real measurement from MoodSync's own heuristics right in
 * the UI, not just in docs — see docs/WELLNESS_SCORING.md. A user should
 * never mistake a heuristic composite for a clinical measurement. */
const BASIS_LABEL: Record<ScoreBasis, string> = {
  "provider-native": "From your wearable",
  "evidence-informed-heuristic": "MoodSync estimate, evidence-informed",
  heuristic: "MoodSync heuristic",
};

const BASIS_DOT: Record<ScoreBasis, string> = {
  "provider-native": "bg-brand",
  "evidence-informed-heuristic": "bg-gold",
  heuristic: "bg-ink-muted",
};

/** The "dynamic color system" from MoodSync's wellness-state palette,
 * applied per-metric rather than picking one "dominant" mood for the
 * whole card — each score already names a real wellness state
 * (WellnessScores keys), so this is a direct, non-arbitrary mapping onto
 * the --mood-* accents in globals.css instead of a gimmick layered on
 * top. "overall" and "fatigue" fall back to the brand default (no
 * single mood fits "everything combined," and fatigue reads better as a
 * muted signal than a bright accent). */
const SCORE_MOOD: Partial<Record<keyof WellnessScores, string>> = {
  stress: "text-mood-energy",
  recovery: "text-mood-recovery",
  sleep: "text-mood-sleep",
  energy: "text-mood-energy",
  focus: "text-mood-focus",
  relaxation: "text-mood-calm",
};

export function WellnessScoreCard({ scores }: { scores: WellnessScores | null }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Wellness scores</h2>

      {!scores ? (
        <Card className="flex flex-col items-start gap-1.5 py-6">
          <p className="text-sm font-medium text-ink">No wellness scores yet</p>
          <p className="text-sm text-ink-secondary">Connect a wearable and sync to see your scores here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SCORE_ORDER.map((key) => {
            const score = scores[key];
            return (
              <Card key={key} className="py-4 transition-colors hover:bg-surface-hover">
                <p className="text-xs uppercase tracking-wide text-ink-muted">{metricLabel(key)}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${score.value !== null ? (SCORE_MOOD[key] ?? "") : ""}`}>
                  {score.value === null ? <span className="text-base font-normal text-ink-muted">—</span> : score.value}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${BASIS_DOT[score.basis]}`} aria-hidden="true" />
                  {BASIS_LABEL[score.basis]}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-ink-muted">
        Scores marked &quot;MoodSync heuristic&quot; or &quot;evidence-informed&quot; are our own engineering estimates, not clinical
        measurements — see the wellness scoring methodology for the formula behind each one.
      </p>
    </section>
  );
}
