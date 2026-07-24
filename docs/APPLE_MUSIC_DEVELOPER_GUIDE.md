# Apple Music — Developer Setup Guide

Everything the backend and frontend need is built and verified (see
`docs/APPLE_MUSIC_ARCHITECTURE.md`). This guide covers what's left — all
of it requires your own Apple Developer Program membership, since a
MusicKit key can only be generated through Apple's own developer portal.

## 1. Apple Developer Program membership

1. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs) — **$99/year**, unlike Amazon's free Alexa developer account. This is the one real cost blocker for this integration.
2. Enrollment can take anywhere from minutes to a couple of days depending on account verification.

## 2. Generate a MusicKit key

1. [developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list) → **Keys** → **+** (Create a key).
2. Name it (e.g. "MoodSync MusicKit"), check **MusicKit**, **Continue** → **Register**.
3. **Download the `.p8` file immediately** — Apple lets you download it exactly once. If you lose it, you have to revoke the key and generate a new one.
4. Note the **Key ID** shown on this page — this is `APPLE_MUSIC_KEY_ID`.
5. Note your **Team ID** — visible at the top-right of the Developer Program membership page, or under Account → Membership Details — this is `APPLE_MUSIC_TEAM_ID`.

## 3. Set environment variables

Add to your backend's environment (Railway → `backend` service → Variables, same place the Alexa/Hue/etc. secrets live — see `docs/DEPLOYMENT.md` for why these must be set directly on the service, not via Project-level Shared Variables):

```
APPLE_MUSIC_TEAM_ID=<your 10-character Team ID>
APPLE_MUSIC_KEY_ID=<the Key ID from step 2>
APPLE_MUSIC_PRIVATE_KEY=<the full contents of the .p8 file, including the BEGIN/END lines>
```

For `APPLE_MUSIC_PRIVATE_KEY`, paste the `.p8` file's contents exactly as
downloaded (it's PEM text — multiple lines starting with
`-----BEGIN PRIVATE KEY-----`). Most env var UIs (including Railway's)
accept multi-line values directly in a text field; if yours doesn't,
replace real newlines with literal `\n` and confirm the value round-trips
correctly (`jose`'s `importPKCS8` requires real PEM text, so a mangled
key will fail to import loudly, not silently).

## 4. That's it — no app registration step

Unlike Alexa (which needs a skill created in the Developer Console) or
Spotify/Hue (which need an app registered with a redirect URI), MusicKit
has no separate "register your app" step beyond generating the key
above. There's also no redirect URI to configure anywhere — MusicKit JS's
`authorize()` call handles the entire sign-in flow itself, in-browser.

## 5. Verify it's live

1. Redeploy the `backend` service after setting the env vars.
2. Log into MoodSync, go to **Connections**, find the Apple Music card — if it now shows a "Connect Apple Music" button instead of the "not configured" message, the developer token is issuing correctly.
3. Click Connect — Apple's sign-in UI should appear. You'll need an Apple ID; playback and library access additionally require that Apple ID to have an **active Apple Music subscription** (a free Apple ID without a subscription can still authorize, but catalog playback and library sync will come back restricted/empty — that's Apple's platform requirement, not a MoodSync limitation).
4. Once connected, `/dashboard/music` should show your real library and recently-played tracks.

## What's a genuine blocker vs. what's already done

| | Status |
|---|---|
| Developer-token signing (ES256 JWT via `jose`) | ✅ Done, typechecked, no live key to test against yet |
| `AppleMusicConnection` schema + repository (encrypted at rest) | ✅ Done |
| Connect/disconnect routes | ✅ Done |
| MusicKit JS client wrapper (auth, playback, search, library) | ✅ Done, builds clean, cannot be exercised against real Apple traffic without a key |
| Connections page card | ✅ Done, verified in-browser (shows the correct "not configured" state right now) |
| Home / Search / Library pages | ✅ Done, builds clean |
| Apple Developer Program membership | ❌ Requires your own $99/year enrollment |
| MusicKit key generation | ❌ Requires the above |
| Setting the three env vars | ❌ Requires the above |
| Testing against real Apple Music data | ❌ Requires all of the above |
