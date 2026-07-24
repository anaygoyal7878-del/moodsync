# Apple Music — Architecture

## 0. Status

Built and verified (typecheck/build clean across `database`, `backend`,
`frontend`): schema, backend developer-token issuance, connect/disconnect,
and a real MusicKit JS integration (Home/Search/Library, playback
control) in the dashboard. **Not yet live** — this server has no Apple
Developer Program membership or MusicKit key configured, so every
Apple-Music-touching request returns a clear "not configured" response
rather than fabricated/fake data. It goes live the moment the four
`APPLE_MUSIC_*` steps in `docs/APPLE_MUSIC_DEVELOPER_GUIDE.md` are done —
no code changes required.

Several features requested alongside this (AI recommendations, mood
playlists, automation-triggered playback, listening analytics) are
deliberately **not built yet** — see §5 for why each one specifically
needs more than just a working connection to build honestly.

## 1. Why this doesn't look like MoodSync's other integrations

Every other third-party integration in this codebase (WHOOP, Hue,
Spotify, Alexa, …) is a standard OAuth 2.0 client: MoodSync's backend
redirects the user to the provider, gets a code back on a callback route,
exchanges it for an access/refresh token pair with a fixed `expiresAt`,
and stores that in `OAuthToken`.

Apple Music doesn't work that way at all:

- There is no OAuth authorize/callback redirect. Authorization happens
  entirely client-side, via **MusicKit JS**'s `music.authorize()` call in
  the browser — Apple's Music-ID login UI is presented by the SDK itself,
  not a URL MoodSync's backend can build or intercept.
- What comes back is a **Music User Token** with no fixed expiry Apple
  documents anywhere — unlike every OAuth token here, which has a real
  `expiresAt`.
- MoodSync doesn't authenticate to Apple with a client secret. It signs
  its own **developer token** (a JWT) using a private key from Apple's
  Developer Program (a MusicKit key, `.p8` file) — this authenticates the
  *app*, not any individual user.

Consequence: this needed its own Prisma model (`AppleMusicConnection`,
not `SmartHomeConnection` + `OAuthToken`), its own repository, and its
own route shape (a developer-token endpoint MusicKit JS calls before it
can do anything, plus a `connect` endpoint that just receives whatever
token the browser already obtained — no callback route exists at all).

## 2. The two tokens, concretely

| | Developer token | Music User Token |
|---|---|---|
| Identifies | MoodSync (the app) | One MoodSync user's Apple Music library |
| Minted by | MoodSync's backend, signing a JWT with the MusicKit private key | Apple, returned to the browser from `MusicKit.authorize()` |
| Stored where | Nowhere — re-signed fresh on every request (`appleMusicService.issueDeveloperToken`) | `AppleMusicConnection.musicUserTokenCiphertext`, AES-256-GCM encrypted at rest, same as every other provider's secrets |
| Lifetime | 12h TTL set by MoodSync (Apple's own ceiling is 6 months) | No documented fixed expiry |
| Who needs it | Every logged-in user gets the same one | One per user |

`backend/src/services/appleMusicService.ts:issueDeveloperToken` signs it
with `jose`'s `SignJWT`/`importPKCS8` (ES256, `kid` = the MusicKit Key
ID, `iss` = the Team ID) — the same JWT library already used for Alexa's
tokens elsewhere in this codebase.

## 3. Request flow

1. `/dashboard/music/*` mounts `MusicKitProvider` (`frontend/src/lib/musicKitClient.tsx`), which loads MusicKit JS from Apple's CDN (`js-cdn.music.apple.com` — no npm package exists for this; see that file's doc comment for why this is the first `next/script` usage in the codebase).
2. Once the SDK reports itself ready (`musickitloaded`), the client fetches `GET /api/integrations/apple-music/developer-token` (proxies to the backend, which returns 503 with a real error message if `APPLE_MUSIC_*` env vars aren't set).
3. `MusicKit.configure({ developerToken, app })` — MusicKit JS is now usable for catalog browsing even before the user authorizes.
4. User clicks "Connect Apple Music" → `instance.authorize()` — Apple's own sign-in UI, MoodSync never sees the Apple ID or password.
5. The resulting Music User Token gets POSTed to `/api/integrations/apple-music/connect`, which the backend encrypts and stores (`appleMusicConnectionRepository.upsertConnection`) — per the explicit decision to have the backend hold this token (not client-only), so future server-side sync/AI work has something to build on.
6. From here, playback, search, and library browsing all happen **client-side** through `instance.api.music(...)` and `instance.play()`/`setQueue()`/etc. — MoodSync's backend is not in this loop at all for day-to-day use; storing the token was about enabling *future* server-side features (§5), not about proxying every request through the backend today.

## 4. What's real right now

- `/dashboard/music` (Home): connect flow, Now Playing card with real playback controls, Recently Played (via Apple's real `/v1/me/recent/played/tracks` endpoint).
- `/dashboard/music/search`: live catalog search (songs/albums/artists/playlists) against `/v1/catalog/{storefront}/search`, tap a song to play it.
- `/dashboard/music/library`: the user's real Apple Music library playlists via `/v1/me/library/playlists`, tap to play.
- Connections page card: honest three-state UI (not configured / not connected / connected), matching every other provider's card pattern.

## 5. What's deliberately deferred, and why

- **AI Recommendations / Mood Playlists** — need real listening history to recommend from. Building this against zero real data would mean either fabricating example recommendations (this project's stated principle is not to ship that) or building a recommendation engine with nothing to validate it against. Comes after real usage exists.
- **Automation-triggered playback** — the same wall Alexa's device-control research hit: there is no server-to-server Apple Music playback API. A MoodSync automation running server-side genuinely cannot start playback on a device nowhere near an open browser tab. The honest version of this feature is client-side only (playback starts only while `/dashboard/music` or a future companion app is open) — not built yet because it needs its own design pass, not because it's hard.
- **Listening Analytics / wellness correlations** — same as biometric-automation correlation elsewhere in this codebase: needs weeks of real paired data (listening + biometrics) before a correlation claim is anything but noise.
- **Weekly Mixes** — Apple Music's own algorithmic playlists (Heavy Rotation, etc.) aren't exposed via a documented public MusicKit API endpoint for third-party apps to read directly; this needs its own verification pass against Apple's current docs before claiming support, not an assumption.

None of these are stubbed with fake UI — they're absent, with a small
labeled "Coming next" roadmap card on the Home page instead, matching how
this project has always drawn the line between "built" and "planned."

## 6. Files

- `database/prisma/schema.prisma` — `AppleMusicConnection` model
- `database/src/repositories/appleMusicConnectionRepository.ts`
- `backend/src/services/appleMusicService.ts`
- `backend/src/api/routes/integrations/appleMusic.ts`
- `frontend/src/lib/musicKitClient.tsx` — the MusicKit JS provider/hook
- `frontend/src/types/musickit.d.ts` — hand-written MusicKit JS types (no `@types` package exists)
- `frontend/src/lib/appleMusicArtwork.ts`
- `frontend/src/app/dashboard/music/**` — Home/Search/Library
- `frontend/src/components/dashboard/AppleMusicConnectButton.tsx`, `ConnectionsSection.tsx`'s `AppleMusicCard`
- `docs/APPLE_MUSIC_DEVELOPER_GUIDE.md` — setup checklist for when the Apple Developer Program membership exists
