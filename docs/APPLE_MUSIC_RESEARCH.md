# Apple Music — Research (why it's not built)

Referenced from `docs/DECISION_ENGINE_ROADMAP.md`'s "Music intelligence"
entry: *"Apple Music has a fundamentally different auth model (MusicKit,
not OAuth) — needs its own research phase."* This is that phase's
finding. No prior research on this existed in the repo before this pass.

## Bottom line

**Not built this round.** `integrations/appleMusic` ships the same
typed-interface-only stub pattern as `integrations/garmin`/`integrations/ecobee`
— a status object the rest of the product could reference once this is
real, deliberately *not* wired into `SmartHomeProviderId`
(`shared/src/wearables.ts`) or the action-executor registry
(`ai/src/actionExecutors.ts`), so nothing in the dispatch/rule-builder
path can assume a live connection exists.

## Why: MusicKit's auth model doesn't fit this app's token storage

Apple Music has no OAuth 2.0 authorization-code flow the way Spotify
does. Its authentication is **MusicKit**, built on two different
credentials:

1. A **developer token** — a JWT the *app developer* signs with a
   private key issued via an Apple Developer Program membership (paid,
   $99/year), containing a Team ID and Key ID. This authenticates the
   *app*, not any individual user, and is typically long-lived
   (up to 6 months) rather than a short-lived access token that expires
   and refreshes the way an OAuth access token does.
2. A **user token** (Music User Token) — obtained client-side via
   MusicKit JS or the native MusicKit framework's authorization flow
   (`MusicKit.getInstance().authorize()` on web, or the native
   `SKCloudServiceController`/`MusicKit` framework on iOS/macOS), not a
   server-redirect OAuth dance a backend can drive the way
   `integrations/spotify/src/oauth.ts` does for Spotify.

Neither of these maps cleanly onto this app's `OAuthToken` Prisma model
(`database/prisma/schema.prisma`), which is shaped specifically for
OAuth 2.0: `accessTokenCiphertext`/`refreshTokenCiphertext` with a
**non-nullable** `expiresAt` and a refresh-token exchange flow. MusicKit
has no refresh-token concept — a user token doesn't expire via a refresh
call the way an OAuth access token does, and the developer token isn't
tied to a specific user at all. Storing MusicKit credentials in
`OAuthToken` as-is would mean:

- Leaving `refreshTokenCiphertext` permanently empty (fine — nullable),
  but `expiresAt` would need a real value even though there's no
  natural token-refresh moment to recompute it from.
- The developer token isn't per-user, so it doesn't belong on a
  per-connection row at all — it's an app-level secret (closer to how
  `SPOTIFY_CLIENT_SECRET` is an environment variable, not a stored
  per-user credential).

A real implementation needs either a new, MusicKit-shaped credentials
table (developer token stored once at the app level; user token stored
per-connection with its own real expiry semantics once those are
confirmed against Apple's documentation) — not a forced fit into the
existing OAuth-shaped table.

## What's confirmed vs. not

**Confirmed** (this pass): the two-credential structure above, and that
it's architecturally incompatible with `OAuthToken`'s OAuth-2.0-specific
shape.

**Not confirmed** (would need before implementation): the exact user
token expiry/renewal behavior, whether Apple Music offers a
server-to-server API play-control endpoint comparable to Spotify's
`/me/player/play` (MusicKit's primary design center is client-side
playback control via the MusicKit JS/native SDK, not a REST endpoint a
backend calls the way `SpotifyClient.playPlaylist` does — if there's no
server-callable "start playback" endpoint, MoodSync's whole
`spotify.play_playlist`-shaped action model may not port to Apple Music
at all, closer to the HomeKit "queue for a device to execute" shape than
the Spotify "backend calls it directly" shape), and real Apple Developer
Program enrollment to test against.

## What it would take to build

1. Enroll in the Apple Developer Program, generate a MusicKit private
   key, confirm the developer-token JWT signing flow against Apple's
   real, current documentation.
2. Confirm (not assumed) whether a real server-callable playback-control
   endpoint exists, or whether Apple Music integration would need to be
   client-side (companion-app-driven, like HomeKit) instead of
   backend-driven (like Spotify).
3. Design a MusicKit-appropriate credentials table (or a generalized
   non-OAuth secrets table other future non-OAuth providers could also
   use) rather than stretching `OAuthToken`.
4. Only then extend `SmartHomeProviderId` and the action-executor
   registry — at that point this becomes a real integration, not a stub.
