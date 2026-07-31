# Ultra-Premium Player

`/dashboard/music/player` — the Listening Journey screen. Glass, metallic
borders, an aurora gradient disc, and a live baseline-to-now reading of
what the music is doing to you.

## The two halves

Two independent things run on this screen, and keeping them separate is
the design:

- **MusicKit** drives what's *playing* — artwork, playhead, transport.
- **The MoodSync session feedback loop** drives what's *changing* —
  the emotional progress panel, from `GET /api/music-sessions/live`.

Either can be absent. With no Apple Music connection the transport
disables and says so; with no open session the emotional panel says
nothing is being measured. Neither half fakes the other.

## Real data, not the spec's example figures

The design spec illustrates the before/after panel with stress 80 → 12
and focus 30 → 75. Those are layout examples, and the component does not
hardcode them. What actually renders:

| Panel element | Source |
|---|---|
| "Active State" label + detail | `describeActiveState` (ai/src/moodLanguage.ts) |
| Progress ring | Same function's `progress`, `null` → empty track |
| Baseline column | `MusicSession.baselineStressScore` / `baselineRecoveryScore`, snapshotted at session start |
| "Now" column | Live wellness scores |
| "N min in" | Real elapsed time |
| Track title / artist / artwork | MusicKit `nowPlayingItem` |
| Playhead + duration | MusicKit `currentPlaybackTime` / `currentPlaybackDuration` |

`GET /api/music-sessions/live` returns all of the MoodSync half in one
round trip **on purpose**: the baseline and the "now" reading have to
describe the same instant. Fetching them separately lets a "calmer"
result appear out of rounding noise between two requests.

### Supportive language is computed, not written

"Deeply Settling" is not a string in the component. `describeActiveState`
maps real movement against the session's baseline onto a vocabulary, so
the "human, never clinical" rule is testable and consistent everywhere:

- Under 3 minutes elapsed → "Settling In" (nothing has happened yet)
- Large stress drop → "Deeply Settling"
- Mild drop → "Softening"
- Heart rate down, no stress data → "Coming Down"
- Stress *up* on a calming session → "Still Carrying It", which says the
  session isn't landing and invites trying something else
- Activating modes get their own words entirely — "Lifting", never
  "Deeply Settling" mid-workout

## Deviations from the spec, and why

**1. Scoped tokens, not global.** The spec's palette (sage `#8BA890`,
gold `#C9A961`, base `#0A0B0A`) is close to but not the same as the
`.ms-luxury` palette ~20 shipped pages already use (`#5fb878`,
`#d4af78`, `#141018`). Declaring the spec's values globally would
silently restyle all of them. Everything is scoped to `.ms-player`, with
class names matching the spec verbatim so its copy/paste snippets work
unmodified inside that scope. **Unifying the two palettes is a real
open decision** — see "Open question" below.

**2. `--text-muted` raised from 0.3 to 0.55.** The spec's checklist
requires WCAG AA (4.5:1). Its own `--text-muted: rgba(255,255,255,0.3)`
measures **2.60:1** on `#0A0B0A` — it fails the checklist. Raised to
0.55 (**6.26:1**). The original 0.3 is kept as `--text-faint` for
non-textual strokes and decorative icons, where contrast minimums don't
apply. Verified in-browser:

| Token | Ratio |
|---|---|
| `--text-primary` 0.9 | 15.94:1 |
| `--text-muted` 0.55 | 6.26:1 |
| `--text-secondary` 0.5 | 5.34:1 |
| `--sage` | 7.61:1 |
| `--gold` | 8.76:1 |

**3. No CDN scripts.** The spec's example loads Tailwind, Iconify and
fonts from CDNs. This is a Next.js app with Tailwind compiled at build
time and `lucide-react` already in use — the same icon set Iconify's
`lucide:*` serves. Three render-blocking CDN requests per page load
would be a real regression for zero gain.

**4. Satoshi is not loaded.** Satoshi is a Fontshare release, not a
Google Font. `next/font/google` cannot fetch it, and the spec's own
`<link href="...family=Satoshi...">` silently fails too. **Outfit** is
loaded properly via `next/font` for body text; Space Grotesk (already
self-hosted) carries headlines via `.font-display`. Dropping a licensed
Satoshi `.woff2` into the repo and pointing `--font-display` at it is a
one-line change.

**5. `prefers-reduced-motion` implemented.** The spec's checklist
requires it; its CSS block omits it. The disc settles on a still
mid-gradient state rather than freezing on a hard edge, so it still
reads as liquid metal when animation is off.

**6. No "Zen Studio • AirPlay".** MusicKit JS exposes no output-routing
API in the browser. Naming a room or an AirPlay target would be
decoration pretending to be status. The indicator shows the real
provider, or "Not connected".

**7. Disc darkened past the spec's literal values.** Rendered as
specified, the aurora disc is the brightest object on the screen — a
flat pale mint circle that fails the spec's own "calming, meditative,
never distracting". A radial vignette over the (unmodified) gradient and
a darker inner disc make it read as brushed metal. Caught by looking at
it, not by reading the CSS.

**8. Spindle only without artwork.** As specced, the centre spindle
renders a black dot through the middle of the album art. When artwork
exists it *is* the record label and carries the centre alone.

## Accessibility

- Seek is an `input[type=range]` under the visual bar — keyboard and
  screen-reader operable, which a click-handler div would not be.
- All controls ≥44px hit area (skip buttons are a 40px visual circle in
  a 44px target).
- Every icon-only control has an `aria-label`; decorative layers are
  `aria-hidden`.
- Verified no horizontal overflow at 375px.

## Open question for the next round

The app now has two adjacent luxury palettes: `.ms-luxury` (every
dashboard page) and `.ms-player` (this screen). They are close enough to
look like a bug and far enough apart to look inconsistent side by side.
Worth deciding deliberately: migrate `.ms-luxury` onto the spec's values
(restyles ~20 pages, needs a visual pass on each), or keep the player as
a deliberately distinct "full-bleed media" surface. Not decided here
because it's a product call, not an implementation detail.
