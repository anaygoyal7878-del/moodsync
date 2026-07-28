# Music Intelligence — Architecture

## 1. What this actually is, and isn't

MoodSync has **no curated playlist catalog**. "Recommended for Right
Now" never invents or serves a MoodSync-owned playlist — it computes a
**category** (Focus/Relax/Reading/Workout/Recovery/Morning/Rainy Day)
from real signals, then matches that category's keywords against
playlist names in the user's own connected Apple Music library. If no
playlist matches, the UI says so honestly rather than fabricating a
result.

This mirrors the exact heuristic already used for Apple Home scene
recommendations in `ai/src/recommendations.ts` (keyword match against
the user's real scene names) — same pattern, same honesty tier.

## 2. Category selection — `ai/src/musicIntelligence.ts`

Priority order (MoodSync's own engineering judgment, documented as
such, not a behavioral-science finding):

1. Weather `rain`/`storm` → **Rainy Day**
2. Elevated stress (≥65) → **Relax**
3. Early morning (5am-9am, user-local time) → **Morning**
4. Low recovery (≤40) → **Recovery**
5. Working hours (9am-5pm) → **Focus**
6. Default → **Relax**

Weather comes from `@moodsync/integration-weather` (only if the user
has set a location — see `docs/WEATHER_INTEGRATION.md`); wellness
scores from the existing `computeWellnessScores`; time of day from the
user's stored IANA timezone (`User.timezone`), not the server's local
clock.

## 3. Why the playlist match is client-side

Apple Music integration in this codebase is entirely MusicKit JS
(browser SDK, no backend proxy for library data) — there is no server-
side "list this user's Apple Music playlists" endpoint to build a
server-side match against. `RecommendedForNow.tsx` fetches the category
from `GET /api/music/recommended-category`, then calls MusicKit JS's
`/v1/me/library/playlists` directly (same call `library/page.tsx`
already makes) and matches locally.

## 4. Verification

`npm test -w ai` — 6 tests covering the full priority order, including
that weather wins over an elevated stress signal. The client-side match
itself (real Apple Music library call) was not exercised live — no
Apple Music account available in this sandbox; same tier as every other
MusicKit-JS-dependent feature already in this codebase.
