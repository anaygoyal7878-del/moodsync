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

**1. Tokens are global, not scoped.** *(Revised — the first cut scoped
them to `.ms-player` to avoid restyling the rest of the app. That was
then adopted app-wide on purpose; see "The palette question" below.)*
The spec's palette now lives in `.ms-luxury` and drives the whole
product. Class names match the spec verbatim, so its copy/paste
snippets work anywhere in the app.

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

## The palette question — now resolved

An earlier revision of this doc flagged that the app had two adjacent
luxury palettes (`.ms-luxury` for the dashboard, `.ms-player` for this
screen) and asked whether to unify them.

**Resolved: unified onto the player's palette, app-wide.** `.ms-luxury`
now carries sage `#8BA890`, champagne gold `#C9A961` and near-black
`#0A0B0A`, replacing the Superdesign draft's aubergine set. `.ms-player`
no longer redefines any tokens — it inherits, so there is exactly one
source of truth.

Two things made this a token edit rather than a 20-page rewrite:

1. `.ms-luxury` already repointed every semantic token
   (`--surface`, `--brand`, `--ink`, …), and every component was already
   written against those rather than raw hexes.
2. The material classes (`.glass-surface`, `.metallic-border`,
   `.satin-depth`, `.gradient-disc`, …) were un-scoped from `.ms-player`
   so any surface in the app can use them. The Music page's Listening
   Journey card is the first to adopt them outside the player.

Status hues were retuned alongside — the previous `#ff916e` / `#ff7a7a`
/ `#93b4e0` were saturated enough to read as a different design language
against a near-black ground. All four replacements clear WCAG AA:

| Token | On `--surface` |
|---|---|
| `--ink` `#e8e9e7` | 15.56:1 |
| `--ink-secondary` `#c2c4c1` | 10.79:1 |
| `--ink-muted` `#9a9c99` | 6.85:1 |
| `--brand` (sage) | 7.31:1 |
| `--gold` | 8.42:1 |
| `--warning` `#d9a86a` | 8.81:1 |
| `--danger` `#cf8b8b` | 6.97:1 |
| `--info` `#93aab5` | 7.81:1 |

### Not visually verified

The retheme propagates to roughly 20 authenticated dashboard pages that
could not be opened in this environment (no Postgres, so no login). Each
token pair was checked numerically and a representative set of surfaces
— Daily Brief hero, score strip, guidance card, glass/metallic card,
status chips, buttons, bottom nav — was rendered standalone and looked
correct. **Individual pages have not been seen.** Worth a pass through
the dashboard once a database is available.
