# MoodSync web prototype — architecture

## Purpose

This is a web prototype meant to validate the product concept (evidence-based
scent recommendations driven by biometric signals) before native iOS
development. It's built so the parts that matter — the recommendation logic
and the evidence data — carry over directly into the native app; only the
data source and the UI framework change.

## Stack

- **React 19 + TypeScript**, Vite build tooling
- **Zustand** for state (a single small store, not Redux-scale ceremony —
  appropriate for a prototype with one real domain of state)
- **React Router** for the two-screen navigation (Dashboard, Scent Library)
- **Recharts** for the wellness timeline chart
- **Framer Motion** for onboarding transitions and the "why this scent" reveal
- **Tailwind CSS** for styling, with a small custom dark palette (`tailwind.config.js`)

## Folder structure

```
src/
  types/domain.ts        Shared domain types (BiometricSample, WellnessAssessment,
                          ScentProfile, ScentRecommendation, ...)
  data/
    scentLibrary.ts       The evidence-backed essential oil database (see RESEARCH.md)
    wellnessStates.ts      Display metadata for the 6 wellness states
    stateStyles.ts          Static Tailwind class lookups per state (see note below)
  health/
    HealthDataSource.ts     The interface everything else depends on
    SimulatedHealthDataSource.ts   Today's implementation (see HEALTHKIT_MIGRATION.md)
    scenarios.ts            Scripted demo biometric profiles
  engine/
    scoreCurve.ts           Piecewise-linear scoring primitive
    features.ts             Converts a BiometricSample into named numeric features
    config.ts               The tunable per-state metric weights ("the model")
    wellnessEngine.ts        Combines features + config into a WellnessAssessment
    scentRecommender.ts      Turns a WellnessAssessment into a ScentRecommendation
  store/useAppStore.ts     Zustand store wiring the data source -> engine -> UI
  components/
    ui/                    Reusable primitives (Card, Button, ConfidenceBadge, ...)
    dashboard/              Dashboard-specific components
    library/                Scent library components
    onboarding/              Onboarding flow
    layout/                 App shell / navigation
  pages/                  Route-level composition of the above
```

## Data flow

```
SimulatedHealthDataSource (or, later, a HealthKit bridge)
  -> emits BiometricSample every ~1.5s
  -> useAppStore.connectHealth() subscribes
      -> assessWellness(sample)        [engine/wellnessEngine.ts]
      -> recommendScent(assessment)    [engine/scentRecommender.ts]
      -> store updates: latestSample, assessment, recommendation, timeline
  -> React components re-render from the store (no prop drilling, no context nesting)
```

## Why the engine has no if/else state logic

Every wellness state's sensitivity to every biometric metric is expressed as
a `(weight, ScoreCurve)` pair in `engine/config.ts` — a piecewise-linear
function mapping a raw value to a 0-1 desirability score. `wellnessEngine.ts`
just does a weighted average per state (renormalized over whichever metrics
are actually present) and a softmax across states for a calibrated
confidence. Improving the model means editing the numbers in `config.ts`,
not the control flow — the same design used in MoodSync's native
`MoodEngine` (see the Swift package), so both surfaces can eventually share
one tuning process instead of drifting into two different heuristics.

## Why evidence is structured as data, not prose

`ScentProfile.evidence` is an array of `ScentEvidenceEntry`, each with an
explicit `relatedStates: WellnessStateId[]` field — the recommender picks
the best-evidenced scent for the current state by looking up entries tagged
for that state, rather than trying to fuzzy-match free text. This is also
why `scentRecommender.ts` can honestly say "no oil has been studied for
meditation support" instead of forcing a fabricated match: when no scent's
`primaryEffects` include a state, the recommender explicitly falls back and
flags `isFallback: true` rather than picking something arbitrary.

## Note: `stateStyles.ts` and Tailwind's JIT compiler

Tailwind only generates CSS for class names it can find as literal strings
in source files. Building a class name dynamically (`` `bg-state-${id}` ``)
would silently produce no CSS. `data/stateStyles.ts` exists purely to keep
the full literal strings (`'bg-state-relax'`, `'bg-state-focus'`, etc.)
somewhere Tailwind's scanner can see them, while still letting components
look them up by state id at runtime.

## What a "production" version of this prototype would still need

This is explicitly a prototype, not a shippable product:
- No persistence — state resets on page reload (acceptable for a demo).
- No authentication or backend — this is one open tab, one session.
- No real device control — there's no diffuser integration layer here (see
  the native `MoodSyncCore` Swift package for that; this prototype is scoped
  to validating the recommendation experience, not device control).
- The wellness engine weights are a reasonable first cut, not validated
  against real user outcome data.
