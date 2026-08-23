# Learning how biometrics relate to mood

MoodSync now trains a model on a person's own data. This doc covers what
it learns, the algorithm, and — at length, because it's the part that
matters — how it's kept from claiming more than it has.

## The problem this exists to fix

Every biometric→mood claim in MoodSync used to come from hand-written
rules in `ai/src/stateEngine.ts`: elevated heart rate plus depressed HRV
is "stressed", low HRV late at night is "preparing for sleep", and so
on. Those rules are plausible. They had also **never been checked
against whether anyone actually felt that way.**

`StateEngineInput.userDeclaredState` existed for exactly this — and its
only call site passed `null`. There were no mood labels anywhere in the
product. You cannot learn how biometrics relate to mood without mood, so
the first thing built here is the label: `MoodCheckIn`.

## What it models: valence and arousal, not "moods"

The target is the **circumplex** — two continuous axes, valence
(unpleasant→pleasant) and arousal (calm→activated) — on a coarse -2..+2
scale, rather than a set of named emotions.

- It's the standard target in affective computing, which means the
  accuracy reported there is the accuracy to expect here. Real-world
  wearable+phone studies land around **F1 ≈ 0.54** for both axes. That
  is useful. It is nowhere near mind-reading, and the product should not
  imply otherwise.
- **Arousal is substantially more learnable from cardiac data than
  valence.** Keeping the axes separate lets MoodSync say "I can predict
  your energy but not your mood", which is often the true answer and
  which averaging into one "mood score" would hide.
- Five points is roughly the resolution people self-report reliably. A
  finer scale would invent precision the label doesn't have.

## The algorithm

Ridge regression, per user, per axis. Deliberately not deep learning:
at n ≈ 20–100 with a handful of features, a small penalised linear
model is the appropriate tool, and its coefficients are directly
interpretable as "how much does this metric pull the prediction".

```
MoodCheckIn (label)          BiometricReading (features)
      │                                │
      └───────────┬────────────────────┘
                  ▼
      affectFeatures.ts — reading strictly BEFORE the check-in,
      z-scored against that person's own prior history
                  ▼
      affectModel.ts — ridge fit, λ chosen by CV, features
      selected inside each fold
                  ▼
      leave-one-out R² vs. the mean predictor
                  ▼
          usable?  ──no──▶  say so plainly, show nothing
                  │yes
                  ▼
        one association, phrased as association
```

### Per-person only, deliberately

Nothing pools data across users. That's the privacy-preserving choice
and also the statistically correct one — the biometric signature of an
affective state is strongly individual, and personalized models
consistently beat population models in this literature. A cold-start
population prior is a reasonable future addition; it is not what this
is, and the docs shouldn't imply a "global model" exists.

### Three features decisions that carry most of the weight

**Personal z-scores, not raw values.** A resting heart rate of 72 means
different things for different people; "11 bpm above your own normal"
means the same for both. Uses `personalBaselines.ts`'s
`compareToBaseline` primitive directly (the `computePersonalBaselines`
wrapper covers a fixed five metrics; this needs a wider per-user set).

**Activity is always a feature when available**, even though nobody
would call it a mood signal. Cardiac measures are heavily confounded by
exertion — an elevated heart rate from a run looks much like one from
stress. Including activity lets the regression hold it constant, so the
heart-rate coefficient means "elevated *beyond* what your activity
explains". Omit it and the model happily learns "exercise = bad mood"
from anyone who checks in after workouts.

**Missing features are dropped, never imputed.** HRV is Apple
Health-only in this codebase, `recoveryScore` is WHOOP-only, and
`stressLevel` has no provider at all today — so the usable feature set
genuinely differs per person. Imputing a missing signal to the mean
invents agreement with the average and quietly biases every coefficient
that survives.

## How it's kept honest

This is a correlational model over observational data. It cannot show
that biometrics *cause* mood or the reverse, and **both directions are
live for every signal here** — poor sleep may flatten mood, and low mood
reliably wrecks sleep. Four mechanisms enforce that:

**1. Out-of-sample scoring only.** Reported R² is leave-one-out
cross-validated against the mean-predictor baseline. In-sample fit is
never shown, because a multi-feature model fit on 30 points looks
impressive on pure noise. There is a test that feeds the model 40 points
of seeded pure noise with 8 features and asserts it scores below the
usability threshold.

**2. Feature selection happens inside each fold**, not once over the
whole dataset. Choosing features using the held-out point and then
scoring on it is the classic way to manufacture a good-looking R². λ is
likewise chosen on training residuals only. This makes the number
pessimistic relative to what small-sample affect papers typically quote
— which is the point, since this number decides whether MoodSync tells
someone it learned something about them.

**3. Floors, not confidence-weighted hedging.** Below
`MIN_SAMPLES_TO_LEARN` (20) nothing is fit at all. At most one feature
per `SAMPLES_PER_FEATURE` (5) samples. A model that can't beat "guess
this person's average" by `MIN_USABLE_R2` (0.1) is marked unusable and
shows nothing — small positive R² is indistinguishable from luck at
these sample sizes.

**4. No temporal leakage.** The feature reading must be strictly
*before* the check-in, and each check-in's baseline is built only from
readings preceding it. A reading taken after someone reports feeling
terrible may already reflect what they did about it; predicting the
present from the future is the leak that makes an evaluation look
excellent and a product feel broken. Both rules have tests.

### A failed fit is a result, not an absence

`learningStatus` distinguishes four situations that look identical in a
naive UI and need completely different responses:

| Situation | What it means |
|---|---|
| Under 20 check-ins | Keep going — nothing has been attempted yet |
| Enough check-ins, few usable | **A sync gap**, not a check-in problem |
| No metric reported consistently | The wearable isn't giving us a feature to learn from |
| Enough data, no model cleared the bar | **We looked and found nothing** |

The last one is stated plainly — "for plenty of people, day-to-day mood
just isn't visible in this data" — rather than dressed up as progress.
The unusable model is still returned with its score attached, so an
absent finding never looks like an absent attempt.

### Language

`describeAssociation` emits "tends to go with", never "causes" or "makes
you", and every sentence carries the sample size and the words "an
association, not a cause". A test asserts the causal vocabulary never
appears. Only the single strongest association is surfaced — the
second-strongest feature in a 4-feature model fit on 25 points is not a
finding.

## Calibrating the state engine

The learned model now feeds `environmentService.getSnapshot`, but not
in the way the gap list originally anticipated. Two findings changed the
design, both worth recording because both are traps.

**`userDeclaredState` is not a prediction slot.** The obvious wiring —
pass `predictAffect`'s output as `StateEngineInput.userDeclaredState` —
is wrong twice. That field short-circuits inference entirely and returns
**confidence 1.0**, with the supporting signal "You told MoodSync what
you're doing." A model prediction is not a declaration: routing one
through there would attribute to the user something they never said, at
a confidence no inference in this codebase is permitted to reach, and
bypass every guard in `assessState`. It stays `null`, with a comment at
the call site saying why.

**The model and the rules share inputs.** `affectFeatures.ts` builds its
vector from heart rate, HRV, sleep, and activity — precisely what
`assessState` already reasons over. So adding the prediction as an
ordinary supporting signal would count the same measurement twice and
inflate confidence for free.

What the model uniquely knows is neither of those things. The rules
assert "elevated heart rate plus depressed HRV means stress" for
everyone; the learned model is the only thing in this codebase that can
say whether that holds for *this* person. That belongs on the
confidence, not on the claim. So `ai/src/affectCalibration.ts`:

1. Places each `MoodState` on the circumplex (MoodSync's own mapping,
   approximate by design — it answers "roughly the same direction?",
   never shown to a user as a number).
2. Compares the model's prediction against that position, **per axis**,
   skipping any axis whose model didn't clear its usability floor. This
   is what keeps "I can read your energy but not your mood" intact here
   rather than averaging it away.
3. Returns a confidence multiplier.

**The asymmetry is deliberate.** Agreement multiplies confidence by
1.1; disagreement by 0.7. Because both sides read the same biometrics,
some agreement is structurally guaranteed and therefore weak evidence —
while disagreement, despite shared inputs, means the person-specific fit
genuinely diverges from the generic rule, which is a real finding.

There is an explicit **inconclusive band** between the two thresholds. A
middling deviation is not evidence in either direction and is not forced
into one.

Every other path returns a multiplier of exactly 1.0. No usable model,
no reading, an `unknown` state, a thrown error — all return the original
assessment untouched. Since most accounts have no usable model, *doing
nothing is the overwhelmingly common outcome*, and the wiring is written
so that outcome costs one cheap count query and nothing else.

## Does this "train on user data"?

Yes, and that is a change from what the messaging docs previously said.
The precise claim now:

- MoodSync **fits a model to your own data, for you.** Your check-ins
  and your readings, producing coefficients used only for your account.
- It does **not** pool your data with other users', and does not send it
  to a model provider for training.

`docs/MESSAGING_AGENTIC_ARCHITECTURE.md` says a "Maximum Privacy"-style
training toggle was not adopted because MoodSync doesn't train on user
data. That statement was true of the LLM path and is still true of it —
Gemini is used for inference only — but it now needs the qualifier that
this per-user statistical model exists.

## Verification

Unit-tested (55 tests): the linear algebra against known solutions;
ridge shrinkage including that the intercept is never penalised (a
penalised intercept would bias every prediction toward "neutral" on a
-2..+2 scale); feature-count capping; the noise-rejection property; the
learnable-vs-unlearnable axis split within one dataset; both leakage
guards; and the causal-language ban. Calibration adds 13 more, weighted toward
the fail-safe paths — no usable model, an `unknown` state, the
inconclusive band, and that an unusable axis genuinely never
participates rather than quietly contributing a zero.

**Not verified:** no real human has ever checked in, so no model has
been fit on genuine data. Everything here is exercised against seeded
synthetic datasets with known ground truth — which is the right way to
test the *machinery* (you can assert it finds signal that is really
there and rejects signal that isn't), and says nothing about whether
real people's biometrics predict their real moods. No Postgres was
available, so the migration and repository are unexecuted.

## Known gaps

- **UI built.** `/dashboard/mood` — a tappable 5x5 circumplex grid
  (`MoodCheckInGrid.tsx`) rather than a slider or a mood-word picker,
  because the grid *is* the storage format: `valence`/`arousal` are each
  an integer -2..+2, so a slider would invent precision the label
  doesn't have, and a word picker would need a mapping table this
  project has avoided everywhere else. Quadrant colouring follows the
  standard circumplex "mood meter" convention, not a MoodSync
  invention. Below it: `AffectInsights.tsx` renders `learningStatus`'s
  four distinct situations, and the top association per usable axis via
  the same `EffectBar` diverging-bar primitive `EnvironmentAnalytics`
  uses — reused rather than reinvented. A free-text note is stored for
  the person's own reading only; the schema comment and the placeholder
  copy both say plainly it is never fed to the model.
  **Still not rendered logged-in** — no Postgres in this environment;
  confirmed only that the route compiles, serves, and sits behind the
  auth guard (307 to `/login`), same limitation as every other screen
  built this way this project.
- **Wired into the state engine — as calibration, not as a state
  source.** See "## Calibrating the state engine" above. The obvious
  wiring (feed the prediction into `userDeclaredState`) was investigated
  and rejected as actively wrong; `userDeclaredState` stays `null`.
- **Linear only.** A genuinely U-shaped relationship (arousal that is
  unpleasant at both extremes is the obvious candidate) is invisible to
  this model.
- **No time-of-day or day-of-week term**, so a person whose mood follows
  a strong daily rhythm will have that variance land in the residual and
  depress R² for signals that are real.
- **One reading per check-in.** Trends over the preceding hours are
  likely more informative than a single point, and aren't used.
- **`MIN_USABLE_R2 = 0.1` is a judgement call**, not a derived
  threshold. It's defensible and it is not principled.
