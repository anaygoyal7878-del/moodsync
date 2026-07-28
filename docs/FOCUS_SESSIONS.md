# Focus Sessions

A guided focus timer, following the same real-timer, log-on-completion
pattern as Meditation Sessions.

## Scope decisions

Per explicit scoping during planning, two pieces of the original spec were
dropped entirely rather than faked:

- **Notification silencing**: no public API exists for a third-party iOS
  app to programmatically enable Focus/Do Not Disturb — confirmed via
  research before building anything. Apps can only *respond to* a Focus
  state the user already set (Focus Filters), not trigger it. Not built.
- **Distraction detection**: no signal exists anywhere in this app (no
  screen-time API, no accelerometer/motion feed) that could plausibly
  detect "the user got distracted." Not built.

What *was* kept, real:

- A genuine client-side countdown timer (same `setInterval` pattern as
  `LuxuryMeditation.tsx`), states `idle → running ⇄ paused → completed`.
- Duration presets: 15/25/45/60/90 minutes.
- "Open Spotify" / "Open Apple Music" links — plain `https://open.spotify.com`
  / `https://music.apple.com` in a new tab. Not a queue-setting integration
  (MoodSync has no music-provider connection that can "start" a specific
  playlist server-side without a user-provided target) — just a fast way
  to get to whatever the user already has playing.
- Live heart rate display during a running session — polls
  `GET /api/biometrics/latest` every 30s and shows the most recent reading
  if one exists. Shows nothing when no wearable is connected, not a fake
  number.
- A **focus score**, computed server-side at completion from heart rate
  stability during the session window (`ai/src/focusScore.ts`) — see that
  file's comment for the coefficient-of-variation heuristic and its
  explicit "proxy, not a measurement of attention" framing.

## Data model

`FocusSession` (`database/prisma/schema.prisma`) — logged only on natural
timer completion (`POST /api/focus-sessions`), same as `MeditationSession`.
Stopping or resetting early logs nothing. `focusScore` is nullable —
`null` when fewer than 3 heart rate samples existed in
`[startedAt, completedAt]` to compute one (e.g. no wearable connected, or
a very short session with no sync in that window).

## Not built this round

- No smart-break suggestions during a session (that's a separate feature,
  Smart Breaks, tracked separately).
- No session history page — sessions are logged and returned from
  `GET /api/focus-sessions`, but no dashboard view lists past sessions yet.
