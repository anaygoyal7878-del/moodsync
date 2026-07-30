# Music + Biometrics Feedback Loop

Music in MoodSync is a wellness tool the app learns from, not a playback
feature. Every session is measured, and over time the app works out which
music actually helps this person focus, relax, recover, or sleep.

## The loop

1. **Record** — starting music from MoodSync opens a `MusicSession` and
   snapshots the biometric baseline (`POST /api/music-sessions`).
2. **Measure** — ending it compares heart rate before vs. during and
   stores the outcome (`POST /api/music-sessions/:id/complete`).
3. **Explain** — the summary card shows the sentence, the number, the
   windows compared, and how much weight it deserves.
4. **Learn** — `ai/src/musicMemory.ts` aggregates completed sessions into
   effectiveness rankings per playlist, genre, mode and hour.
5. **Recommend** — those rankings become the "what to reach for"
   sentences on the analytics page and the "next time" line on the
   summary card.

## What is measurable, and what is not

This is the part that decides whether the feature is trustworthy.

### Measured

- **Heart rate** — dense enough to compare a 15-minute before-window
  against the session itself. This is the primary signal and the only
  one most sessions will have. Needs ≥3 samples in *each* window and a
  session of ≥5 minutes; otherwise the outcome is `insufficient`.

### Interpretation

- **Next night's sleep score** — for `SLEEP` and `RECOVERY` sessions,
  compared against the user's trailing average. Labelled
  `AI interpretation`, never `Measured change`, because a whole night has
  many other inputs.
- **Focus duration** — mean completed focus-session length while a
  given playlist was open, vs. mean length with no music session running.
  Requires ≥3 sessions on both sides.

### Not measurable — and therefore not built

- **Sleep onset time.** The brief asked for "sleep prep music helped you
  fall asleep faster." MoodSync stores a sleep *score* and stage minutes
  but **no sleep-session start timestamps** — no provider integration
  here ingests them (see `docs/SLEEP_COACH.md`). That sentence cannot be
  produced honestly, so it is not produced. Sleep-mode sessions are
  judged on heart-rate decline during the session plus the next-night
  interpretation above.
- **Interruption frequency.** No signal exists for it anywhere in this
  app. Not modelled.

## Mode-aware outcomes

The mode a session was started in decides which direction counts as
working. This is what makes the feedback feel intelligent rather than
mechanical — a heart rate that climbs during a Workout session is the
music doing its job, and MoodSync says so:

| Mode | Wants heart rate to | A drop reads as |
|---|---|---|
| Focus, Relax, Sleep, Recovery | come down | working |
| Morning, Workout | go up | not the usual direction |

`modeWantsLowerHeartRate` in `ai/src/musicFeedback.ts` is the single
source of that rule; the UI never re-derives it.

## Confidence labels

Every outcome carries one, and it travels in the payload so no UI
surface can drop it:

- **Measured change** — a real before/after comparison over enough samples.
- **AI interpretation** — MoodSync joined the dots across a longer span.
- **Not enough data yet** — and no conclusion is drawn.

## Constraints held in the code, not just the copy

- **No causal claims.** Every outcome ships a `caveat` string ("MoodSync
  reports what moved together, not what caused what"), generated in
  `musicFeedback.ts` rather than written into each component. Nothing
  here is medical advice and nothing says the music *caused* a change.
- **No claims below the sample threshold.** Playlist and genre findings
  need ≥3 measured sessions; hour patterns need ≥2; the focus-duration
  comparison needs ≥3 on both sides. Below that, nothing is shown.
- **Sample size is always visible.** "Based on 3 sessions" sits under
  every recommendation.
- **Never claims a playlist hurt focus.** `describeFocusDuration`
  returns `null` for a negative difference — shorter sessions alongside
  a playlist is not evidence it hurt anything.
- **Never interrupts playback.** Ending a session ends the
  *measurement*. The "Finish" button closes the session and leaves the
  music playing; the UI says so explicitly.

## Data model notes

`MusicSession` (`database/prisma/schema.prisma`) stores the baseline
*and* the computed outcome rather than deriving either on read. Two
reasons, both documented on the model:

1. The summary shown right after a session must not silently change
   later when a wearable back-fills readings for that window.
2. The analytics page aggregates hundreds of sessions without re-reading
   raw biometrics each time.

It is deliberately separate from `MusicPlayLog`, which records playback
an *automation rule* triggered (hence its required `ruleId`) purely for
skip detection. This model is the opposite direction: the user chose to
listen, and MoodSync measures the effect.

### Provider normalization

Apple Music and Spotify describe their catalogs differently, so a session
stores what MoodSync needs — display name, item kind
(playlist/track/album/station), the provider's own id, and a
keyword-inferred genre — rather than either provider's native shape.
Adding a provider means mapping into those four fields and nothing else.

Genre is inferred from the item's own name (`inferGenre` in
`backend/src/api/routes/musicSessions.ts`) because neither service
exposes a reliable genre for a user's *own* library playlists. An
unmatched name gets `null`, not a default bucket.

## Not built this round

- Spotify session tracking. The plumbing is provider-agnostic
  (`MusicProviderKind.SPOTIFY` exists and the routes accept it), but only
  the Apple Music path currently opens sessions, since that's where the
  in-app one-tap play lives.
- Per-track outcomes. Sessions are recorded at playlist granularity;
  attributing a heart-rate change to an individual track inside a
  playlist would need playback-position tracking the app doesn't do.
