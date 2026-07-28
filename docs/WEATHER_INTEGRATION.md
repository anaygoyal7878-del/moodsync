# Weather Integration — Architecture

## 1. Why Open-Meteo, and why no OAuth

Confirmed live against `open-meteo.com/en/docs` this session: Open-Meteo
requires **no API key for non-commercial use** — "Only required to
commercial use to access reserved API resources." Every other
integration in this codebase is OAuth-based; weather is the one
exception, since there's no user account on Open-Meteo's side to link
at all.

The only "connection" step is a user typing a free-text location
(`frontend`'s Profile page → `LuxuryWeatherLocationSetting`), resolved
once via Open-Meteo's geocoding API (`geocoding-api.open-meteo.com/v1/search`)
into lat/lng, stored on `UserPreferences.weatherLocationName/weatherLat/weatherLng`.
Null until set — every weather-dependent feature (Music Intelligence's
"Rainy Day," the room-temperature smart notification's weather
awareness) simply doesn't fire rather than guessing a location.

## 2. `WeatherCondition` — MoodSync's own small taxonomy

`integrations/weather/src/client.ts`'s `weatherCodeToCondition` collapses
Open-Meteo's WMO weather-interpretation codes (confirmed live) into six
buckets: `clear | cloudy | fog | rain | snow | storm`. An unrecognized
code falls back to `cloudy` rather than throwing — a real, if imprecise,
category rather than breaking a weather-aware feature over an unmapped
code.

## 3. What reads this

- `ai/src/musicIntelligence.ts`'s `recommendMusicCategory` — `rain`/
  `storm` conditions map to the "Rainy Day" category.
- `backend/src/api/routes/music.ts` — fetches current weather (best-
  effort, a failure here degrades to "no weather signal" rather than
  failing the whole recommendation).

## 4. Verification

`npm test --workspace=integrations/weather` — 9 tests covering WMO code
mapping (all six buckets + an unrecognized-code fallback) and the two
client methods against mocked `fetch` responses shaped like Open-Meteo's
real documented response format. No live API calls were made against
Open-Meteo from this sandbox — confirmed via documentation only, same
tier as this project's other "verified against docs, not a live
account" integrations.
