# Home Health (Environment) Score — Architecture

## 1. Scope decision

The product spec asked for Temperature, Humidity, Air Quality, Noise,
Lighting, and Diffuser status. Per explicit product decision, **Noise,
Lighting, and Diffuser are not modeled at all** — no sensor for any of
them exists in the current `HomeRoomSnapshot` data (Diffuser only
exists in old, disconnected legacy code predating this platform — see
`README.md`). The score and the UI show only the three real metrics.

## 2. Real gap found and fixed while building this

`HomeKitController.fetchHomeSnapshot()` (built in an earlier round, the
HomeKit Scenes work) had `temperatureC`/`humidityPct`/`airQuality`
fields on `HomeSnapshotDTO.Room`, but **nothing ever populated them** —
rooms were constructed with just `roomId`/`name`. A Home Health Score
built on top of that would have shown "no data" for every room. Fixed
by aggregating each room's accessories' real sensor characteristics
(`HMCharacteristicTypeCurrentTemperature`,
`HMCharacteristicTypeCurrentRelativeHumidity`,
`HMCharacteristicTypeAirQuality`) — same "compile-verified, not
device-tested" caveat as the rest of `HomeKitController.swift` (HomeKit
doesn't exist on macOS, see `docs/HOME_SCENES_ARCHITECTURE.md`).

## 3. Scoring

`ai/src/homeWellness.ts`, same `{value, basis}` shape as
`ai/src/wellness.ts`'s personal wellness scores:

- **Temperature**: ASHRAE Standard 55's general comfort range
  (20-24°C) — 100 inside the range, falling off linearly to 0 at ±6°C
  past either edge (MoodSync's own falloff curve; the range itself is a
  real cited HVAC standard).
- **Humidity**: EPA's recommended indoor range (30-50%) to limit dust
  mites/mold while avoiding excess dryness — same real-range-plus-
  MoodSync-falloff pattern.
- **Air quality**: parses HomeKit's `HMCharacteristicValueAirQuality`
  ordinal (0-5) or a known English name (excellent/good/fair/inferior/
  poor) into a score. **Not independently confirmed against a live
  account** — an unrecognized value returns `null`, never a guess.
- **Overall (per room)**: average of whichever of the three above have
  real data — a room with no sensors at all scores `null`, not 0.
- **Overall (home-wide)**: average across rooms that have any real data.

## 4. Where this surfaces

`GET /api/home` now also returns `roomWellness`/`overallWellness`
alongside the existing snapshot. `LuxuryHome.tsx` shows a per-room score
badge and a "Home Wellness" tile in the overview stats — both hidden
entirely when there's no data (never a fabricated 0 or "—" placeholder
presented as real).

## 5. Verification

`npm test -w ai` — 9 tests covering in-range scoring, falloff direction,
null-not-zero for missing sensors, all air-quality parse paths
(numeric, named, unknown-0, unrecognized), and both single-room and
home-wide averaging (including "no room has any data → null overall").
