import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Amazfit devices sync through the Zepp app, operated by Zepp Health
 * (formerly Huami). A real OAuth 2.0 API for third-party access to a
 * user's health data does exist — confirmed directly from the official
 * `zepp-health/rest-api` wiki (an official Huami/Zepp company
 * repository, not a community project):
 *
 *   Authorization: https://user.huami.com/oauth/index.html#/?client_id=...&redirect_uri=...&response_type=code&state=...
 *   Token exchange: POST https://auth.huami.com/oauth2/access_token
 *   Grant types: authorization_code (recommended) or implicit
 *   Scopes: profile, activity, sleep, heartrate, motion, sport, sportDetail
 *   Token lifetime: 90-day access token, 10-year refresh token
 *
 * But registration is explicitly gated: "To apply for data cooperation,
 * please go to the official website (https://dev.huami.com/#/home) to
 * register and submit an application. The review period is 3-7 days,"
 * and critically, "Data cooperation currently only supports corporate
 * users, not individual users." There is no self-serve path to a
 * client ID the way Fitbit, WHOOP, or Spotify offer — same category of
 * blocker as `integrations/garmin` (Connect Developer Program) and
 * `integrations/ecobee` (registration closed), just for a different
 * underlying reason (business-partnership-only rather than
 * closed/frozen). This package intentionally has no live client for the
 * same reason those two don't: there's nothing to test it against
 * without an approved corporate partnership, and untested OAuth/client
 * code is more likely to ship with real bugs than not (see the Fitbit
 * CivilDateTime/filter-field fixes in docs/INTEGRATIONS_RESEARCH.md for
 * exactly that failure mode in this same codebase). The real endpoints
 * above are recorded here so implementation can start immediately if a
 * partnership is ever approved, without needing to re-research from
 * scratch.
 */
export const amazfitIntegrationStatus: IntegrationStatus = {
  id: 'amazfit',
  displayName: 'Amazfit',
  availability: 'not_yet_available',
  unavailableReason:
    "Amazfit/Zepp's health data API (dev.huami.com) requires a corporate partnership application with a 3-7 day review — there's no self-serve individual developer path. We'll enable this if a partnership is approved.",
};
