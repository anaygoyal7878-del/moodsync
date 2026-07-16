# Wellness Scoring Methodology

Every score computed by `ai/src/wellness.ts` is 0-100, and every score is
explicitly labeled with its `basis` — `provider-native` (a real
measurement from the wearable's own API), `evidence-informed-heuristic`
(MoodSync's own formula, but built on a methodology with real research
backing), or `heuristic` (MoodSync's own engineering estimate, no
clinical basis). The label is surfaced in the dashboard UI itself
(`WellnessScoreCard`), not just in this document — a user should never
mistake a heuristic for a clinical measurement.

A score is `null`, never guessed, when its required inputs are absent —
same convention as `ai/src/ruleEngine.ts`'s "a condition on a missing
field never matches."

## Stress — `evidence-informed-heuristic`

**What's evidence-based**: comparing a user's own recent HRV/RHR to
their own rolling baseline via z-score, rather than population norms or
a universal formula. Recent research (2024–2025) on wearable stress
scoring is consistent on this point — no single accepted "stress score"
formula exists industry-wide; every commercial one (Garmin, WHOOP, etc.)
is proprietary and validated only via correlation against raw HRV/RHR,
not treated as ground truth itself.

- Rosenbach et al., 2025, *Stress and Health* (Wiley) — "Assessing Stress
  Level Scores Against Wearables-Driven Physiological Measurements."
- Garmin stress-score validation preprint, bioRxiv 2025.01.06.630177 —
  found Garmin's stress score correlates with HR, RMSSD, and SD2/SD1, but
  is not a reproduction of a published formula.
- Consistent theme: "what matters more than where you fall on population
  curves is how your own morning HRV compares to your own recent
  average" — nightly RHR/HRV standardized via Z-score against a trailing
  window (commonly 30 days) for within-subject comparison.

**What's MoodSync's own heuristic**: the exact 0-100 mapping curve.
Implementation (`computeStressScore`): requires `heartRateVariability` on
both the latest reading and >=5 historical points (Apple Health-only
today — the only provider populating HRV); computes a z-score against
the trailing history, secondarily blends in a resting-heart-rate z-score
at lower weight (0.3 vs. 0.7) if available, then maps
`50 + z * 25` clamped to [0, 100] — a z-score of 0 (exactly at baseline)
scores 50; +/-2 standard deviations maps to the 0/100 extremes. This
curve is not derived from any published source — it's an engineering
choice, documented as such.

## Recovery — `provider-native` (WHOOP) or `evidence-informed-heuristic` (otherwise)

WHOOP's own `recoveryScore` is passed through directly when present —
real, provider-computed, nothing invented.

For providers without a native recovery score (Apple Health today), a
heuristic composite is computed, informed by WHOOP's own published
commentary on their methodology: HRV carries most of the signal ("HRV
carries most of the Recovery signal because it reflects day to day
changes in how your autonomic nervous system is handling stress and
load"), interpreted through resting heart rate, with sleep a smaller
contribution (rationale: sleep duration alone can mislead — someone sick
might sleep 16 hours and still be far from recovered).

**Explicitly not a reproduction of WHOOP's proprietary algorithm** —
WHOOP has never published exact weights (one third-party estimate cites
70% HRV / 20% HR during deep sleep / 10% restorative sleep, but WHOOP's
own commentary describes a simpler HRV-dominant/RHR-secondary/sleep-minor
relationship without exact percentages). MoodSync's implementation
(`computeRecoveryScore`) uses HRV z-score at weight 0.7, RHR z-score
(inverted) at weight 0.2, and a small sleep-score-relative nudge at
weight 0.1 — chosen to match the qualitative relationship described
publicly, not to replicate a formula that isn't public.

## Sleep — `provider-native` only

Passes through the provider's own `sleepScore` directly (Apple
Health/Google Health compute this on-device or server-side already — see
`docs/APPLE_HEALTH_ARCHITECTURE.md`/`docs/INTEGRATIONS_RESEARCH.md`).

**No new formula is invented here.** `NormalizedBiometricReading` has no
deep/REM sleep-stage breakdown fields — only a single `sleepScore`.
Formulas exist in the wild for stage-weighted sleep scoring (e.g. one
cited implementation: 40% total sleep time, 40% deep sleep, 20%
efficiency), but building one against data this product doesn't collect
would mean inventing inputs, which the project's research-first rule
prohibits. Adding stage-level fields to the schema is a documented
roadmap item.

Sleep efficiency itself, for reference (not currently computed by
MoodSync, since no raw time-in-bed/time-asleep fields are collected):
`(hours slept / hours in bed) × 100%`, with 85%+ considered good — a
widely-cited, simple, real formula, noted here for when stage-level data
is added.

## Energy — `provider-native` only

Reuses the existing `activityLevel` field directly — already a real,
normalized 0-100 composite from whatever the source provider's raw
steps/strain data supports (see `shared/src/wearables.ts`). No new
computation.

## Fatigue, Focus, Relaxation — `heuristic` only

No accepted clinical or industry-standard formula exists for deriving
any of these three from wearable biometrics alone. Each is a documented,
simple blend of the scores above:

- **Fatigue** = `100 - mean(recovery, sleep)` (using whichever of the two
  is available; `null` if neither is).
- **Relaxation** = `100 - stress` (`null` if stress is `null`).
- **Focus** = `0.6 × (100 - stress) + 0.4 × energy`, defaulting either
  missing component to a neutral 50 rather than nulling the whole score
  — a deliberate choice to keep Focus computable more often, at the cost
  of being a weaker signal when one input is missing.

These are never presented as scientific — the UI labels them
"MoodSync heuristic," and this document does the same.

## Overall wellness — `heuristic`

A weighted average of Recovery (30%), Sleep (25%), inverse-Stress (25%),
and Energy (20%) — weights chosen by MoodSync, not derived from any
external source. Only the scores actually available contribute; missing
ones don't count as 0 or 50, the remaining weights are renormalized
proportionally (`computeOverallScore` in `ai/src/wellness.ts`).

## Summary table

| Score | Basis | Real formula/methodology source | MoodSync's own contribution |
|---|---|---|---|
| Stress | evidence-informed-heuristic | Own-baseline z-scoring (2024–2025 HRV research) | The 0-100 mapping curve |
| Recovery (WHOOP) | provider-native | WHOOP's own API | None — passthrough |
| Recovery (other) | evidence-informed-heuristic | WHOOP's published HRV-dominant relationship | The exact weights/curve |
| Sleep | provider-native | Provider's own on-device/server computation | None — passthrough |
| Energy | provider-native | Provider's own `activityLevel` normalization | None — passthrough |
| Fatigue | heuristic | None | Entire formula |
| Focus | heuristic | None | Entire formula |
| Relaxation | heuristic | None | Entire formula |
| Overall | heuristic | None | Entire weighting scheme |
