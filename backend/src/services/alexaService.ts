import { timingSafeEqual } from 'node:crypto';
import {
  signAlexaAuthCode,
  verifyAlexaAuthCode,
  signAlexaAccessToken,
  verifyAlexaAccessToken,
  generateAlexaRefreshToken,
  InvalidAlexaAuthCodeError,
  InvalidAlexaAccessTokenError,
  ALEXA_INTENTS,
  NAMED_RULE_INTENT_KEYWORDS,
  HELP_SPEECH,
  STOP_SPEECH,
  FALLBACK_SPEECH,
  NOT_LINKED_SPEECH,
  plainTextResponse,
  linkAccountResponse,
  type ResponseEnvelope,
  type AlexaIntentName,
} from '@moodsync/integration-alexa';
import {
  smartHomeConnectionRepository,
  oauthTokenRepository,
  wearableConnectionRepository,
  biometricReadingRepository,
  automationRuleRepository,
} from '@moodsync/database';
import { executeHueAction, executeSpotifyAction } from '@moodsync/ai';
import type { AutomationRuleDefinition, NormalizedBiometricReading } from '@moodsync/shared';
import { env } from '../config/env.js';
import { whoopService } from './whoopService.js';
import { fitbitService } from './fitbitService.js';

export class AlexaNotConfiguredError extends Error {
  constructor() {
    super('Alexa integration is not configured on this server (missing skill credentials) — see docs/ALEXA_DEVELOPER_GUIDE.md');
  }
}

export class InvalidAlexaClientError extends Error {}

interface AlexaConfig {
  clientId: string;
  clientSecret: string;
  vendorId: string;
  tokenSecret: string;
}

function requireAlexaConfig(): AlexaConfig {
  if (!env.ALEXA_SKILL_CLIENT_ID || !env.ALEXA_SKILL_CLIENT_SECRET || !env.ALEXA_VENDOR_ID || !env.ALEXA_TOKEN_SECRET) {
    throw new AlexaNotConfiguredError();
  }
  return {
    clientId: env.ALEXA_SKILL_CLIENT_ID,
    clientSecret: env.ALEXA_SKILL_CLIENT_SECRET,
    vendorId: env.ALEXA_VENDOR_ID,
    tokenSecret: env.ALEXA_TOKEN_SECRET,
  };
}

/** The three documented Amazon regional account-linking callback hosts —
 * see docs/ALEXA_ARCHITECTURE.md §6. Anything else is rejected as an open
 * redirect, not just "an unrecognized provider." */
const ALLOWED_REDIRECT_HOSTS = ['pitangui.amazon.com', 'layla.amazon.com', 'alexa.amazon.co.jp'];

function isValidAmazonRedirectUri(redirectUri: string, vendorId: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (!ALLOWED_REDIRECT_HOSTS.includes(url.hostname)) return false;
  return url.pathname === `/api/skill/link/${vendorId}`;
}

/** Plain `===` on secrets is a timing side-channel; Node's
 * `timingSafeEqual` requires equal-length buffers, so a length mismatch
 * (itself not sensitive — it doesn't reveal any byte of the actual
 * secret) is checked first and short-circuits to `false`. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function requireValidClientCredentials(config: AlexaConfig, clientId: string, clientSecret: string): void {
  if (clientId !== config.clientId || !timingSafeStringEqual(clientSecret, config.clientSecret)) {
    throw new InvalidAlexaClientError('Invalid client_id or client_secret');
  }
}

export const alexaService = {
  /**
   * Step 5 of docs/ALEXA_ARCHITECTURE.md §4 — called by the frontend
   * consent page (authenticated as the logged-in MoodSync user) after the
   * user approves linking. Returns the final URL to redirect the browser
   * to, completing the round trip back to Amazon.
   */
  async completeAuthorization(params: {
    userId: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    amazonState: string;
  }): Promise<string> {
    const config = requireAlexaConfig();
    if (params.clientId !== config.clientId) {
      throw new InvalidAlexaClientError('Unknown client_id');
    }
    if (!isValidAmazonRedirectUri(params.redirectUri, config.vendorId)) {
      throw new InvalidAlexaClientError('redirect_uri is not a recognized Amazon account-linking callback');
    }

    const code = await signAlexaAuthCode(config.tokenSecret, {
      userId: params.userId,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', params.amazonState);
    return redirectUrl.toString();
  },

  /**
   * Step 7-9 of docs/ALEXA_ARCHITECTURE.md §4 — the OAuth token endpoint
   * Amazon's servers call directly (server-to-server, HTTP Basic client
   * auth), for both grant_type=authorization_code and
   * grant_type=refresh_token.
   */
  async issueToken(params: {
    grantType: 'authorization_code' | 'refresh_token';
    clientId: string;
    clientSecret: string;
    code?: string | undefined;
    redirectUri?: string | undefined;
    refreshToken?: string | undefined;
  }): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }> {
    const config = requireAlexaConfig();
    requireValidClientCredentials(config, params.clientId, params.clientSecret);

    let userId: string;
    let scope: string;

    if (params.grantType === 'authorization_code') {
      if (!params.code || !params.redirectUri) {
        throw new InvalidAlexaClientError('authorization_code grant requires code and redirect_uri');
      }
      let payload;
      try {
        payload = await verifyAlexaAuthCode(config.tokenSecret, params.code);
      } catch (error) {
        if (error instanceof InvalidAlexaAuthCodeError) throw new InvalidAlexaClientError(error.message);
        throw error;
      }
      if (payload.redirectUri !== params.redirectUri) {
        throw new InvalidAlexaClientError('redirect_uri does not match the one used to obtain this code');
      }
      userId = payload.userId;
      scope = payload.scope;
    } else {
      if (!params.refreshToken) throw new InvalidAlexaClientError('refresh_token grant requires refresh_token');
      // Refresh tokens are "<userId>:<opaque secret>" — a standard
      // selector:verifier split so the encrypted secret half never needs
      // a full-table scan-and-decrypt to look up. userId itself isn't
      // secret; forging a valid token still requires the random half.
      const separatorIndex = params.refreshToken.indexOf(':');
      if (separatorIndex === -1) throw new InvalidAlexaClientError('Malformed refresh_token');
      const presentedUserId = params.refreshToken.slice(0, separatorIndex);
      const presentedSecret = params.refreshToken.slice(separatorIndex + 1);

      const connection = await smartHomeConnectionRepository.findByUserAndProvider(presentedUserId, 'ALEXA');
      if (!connection?.oauthTokenId) throw new InvalidAlexaClientError('Unknown refresh_token');
      const stored = await oauthTokenRepository.getDecrypted(connection.oauthTokenId);
      if (!stored?.refreshToken || !timingSafeStringEqual(stored.refreshToken, presentedSecret)) {
        throw new InvalidAlexaClientError('Unknown refresh_token');
      }
      userId = presentedUserId;
      scope = stored.scope;
    }

    const { token: accessToken, expiresInSeconds } = await signAlexaAccessToken(config.tokenSecret, userId);
    const refreshSecret = generateAlexaRefreshToken();
    const refreshToken = `${userId}:${refreshSecret}`;

    await smartHomeConnectionRepository.upsertConnection({
      userId,
      provider: 'ALEXA',
      tokens: {
        accessToken,
        refreshToken: refreshSecret,
        scope,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });

    return { accessToken, refreshToken, expiresInSeconds };
  },

  /** Resolves the `context.System.user.accessToken` on an incoming voice
   * request to a MoodSync userId — returns null (not a throw) for an
   * absent/invalid token, since that's an expected, common state (the
   * user hasn't linked yet, or their link expired) that the caller
   * responds to with a LinkAccount card, not an error. */
  async resolveUserId(accessToken: string | undefined): Promise<string | null> {
    if (!accessToken) return null;
    const config = requireAlexaConfig();
    try {
      const { userId } = await verifyAlexaAccessToken(config.tokenSecret, accessToken);
      return userId;
    } catch (error) {
      if (error instanceof InvalidAlexaAccessTokenError) return null;
      throw error;
    }
  },

  /** Routes a verified voice request to its handler and marks the
   * connection as synced (see docs/ALEXA_ARCHITECTURE.md §9 for the full
   * intent -> implementation mapping). */
  async handleIntentRequest(userId: string, intentName: string): Promise<ResponseEnvelope> {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'ALEXA');
    if (connection) await smartHomeConnectionRepository.markSynced(connection.id);

    switch (intentName as AlexaIntentName) {
      case ALEXA_INTENTS.GET_STATUS:
        return this.handleGetStatus(userId);
      case ALEXA_INTENTS.GET_SLEEP_SUMMARY:
        return this.handleGetSleepSummary(userId);
      case ALEXA_INTENTS.SYNC_DEVICES:
        return this.handleSyncDevices(userId);
      case ALEXA_INTENTS.START_RELAXATION:
      case ALEXA_INTENTS.IMPROVE_FOCUS:
      case ALEXA_INTENTS.ACTIVATE_EVENING_ROUTINE:
        return this.handleNamedRuleIntent(userId, intentName as AlexaIntentName);
      case ALEXA_INTENTS.HELP:
        return plainTextResponse(HELP_SPEECH, false);
      case ALEXA_INTENTS.STOP:
      case ALEXA_INTENTS.CANCEL:
        return plainTextResponse(STOP_SPEECH, true);
      case ALEXA_INTENTS.FALLBACK:
      default:
        return plainTextResponse(FALLBACK_SPEECH, false);
    }
  },

  async handleGetStatus(userId: string): Promise<ResponseEnvelope> {
    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    if (!latest) return plainTextResponse("I don't have any recent health data for you yet.");
    return plainTextResponse(describeReading(latest.reading));
  },

  async handleGetSleepSummary(userId: string): Promise<ResponseEnvelope> {
    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    if (!latest?.reading.sleepScore) {
      return plainTextResponse("I don't have a recent sleep score for you yet.");
    }
    return plainTextResponse(`Your most recent sleep score is ${Math.round(latest.reading.sleepScore)} out of 100.`);
  },

  async handleSyncDevices(userId: string): Promise<ResponseEnvelope> {
    const [whoop, fitbit] = await Promise.all([
      wearableConnectionRepository.findByUserAndProvider(userId, 'WHOOP'),
      wearableConnectionRepository.findByUserAndProvider(userId, 'GOOGLE_HEALTH'),
    ]);

    const synced: string[] = [];
    const failed: string[] = [];

    for (const [connection, name, sync] of [
      [whoop, 'WHOOP', () => whoopService.syncConnection(whoop!.id, userId)],
      [fitbit, 'Fitbit', () => fitbitService.syncConnection(fitbit!.id, userId)],
    ] as const) {
      if (!connection || connection.status !== 'ACTIVE') continue;
      try {
        await sync();
        synced.push(name);
      } catch {
        failed.push(name);
      }
    }

    if (synced.length === 0 && failed.length === 0) {
      return plainTextResponse("You don't have any connected devices to sync yet.");
    }
    const parts: string[] = [];
    if (synced.length > 0) parts.push(`synced ${synced.join(' and ')}`);
    if (failed.length > 0) parts.push(`couldn't reach ${failed.join(' and ')}`);
    return plainTextResponse(`I've ${parts.join(', and ')}.`);
  },

  /** Shared implementation for StartRelaxationIntent, ImproveFocusIntent,
   * and ActivateEveningRoutineIntent — see
   * docs/ALEXA_ARCHITECTURE.md §9 for why this reuses the user's own
   * automation rules instead of a hardcoded scene. */
  async handleNamedRuleIntent(userId: string, intentName: AlexaIntentName): Promise<ResponseEnvelope> {
    const keyword = NAMED_RULE_INTENT_KEYWORDS[intentName];
    if (!keyword) return plainTextResponse(FALLBACK_SPEECH, false);

    const rules = await automationRuleRepository.listForUser(userId);
    const match = rules.find((rule) => rule.enabled && rule.name.toLowerCase().includes(keyword));
    if (!match) {
      return plainTextResponse(
        `I couldn't find an automation rule with "${keyword}" in its name. ` +
          'Create one in the MoodSync dashboard, then try again.',
      );
    }

    const failures = await executeRuleActionsDirectly(userId, match);
    if (failures.length === 0) {
      return plainTextResponse(`Done — I've run your "${match.name}" routine.`);
    }
    if (failures.length === match.actions.length) {
      return plainTextResponse(`I couldn't run your "${match.name}" routine — every action failed.`);
    }
    return plainTextResponse(`I've partially run your "${match.name}" routine, but ${failures.join(' and ')} didn't work.`);
  },
};

/** Runs every action in a rule directly, in order, independent of one
 * another (one failing doesn't stop the rest) — mirrors the per-action
 * isolation `ai/src/dispatch.ts` already uses for the automatic path,
 * just without the condition/cooldown check since this is an explicit
 * voice command. Returns a human-readable label per failed action. */
async function executeRuleActionsDirectly(userId: string, rule: AutomationRuleDefinition): Promise<string[]> {
  const failures: string[] = [];
  for (const action of rule.actions) {
    try {
      if (action.provider === 'hue') {
        await executeHueAction(userId, action);
      } else if (action.provider === 'spotify') {
        await executeSpotifyAction(userId, action);
      } else {
        failures.push(action.provider);
      }
    } catch {
      failures.push(action.provider);
    }
  }
  return failures;
}

function describeReading(reading: NormalizedBiometricReading): string {
  const parts: string[] = [];
  if (reading.heartRate !== undefined) parts.push(`your heart rate is ${Math.round(reading.heartRate)}`);
  if (reading.sleepScore !== undefined) parts.push(`your sleep score is ${Math.round(reading.sleepScore)}`);
  if (reading.activityLevel !== undefined) parts.push(`your activity level is ${Math.round(reading.activityLevel)} percent`);

  if (parts.length === 0) return "I have some recent data, but not enough to summarize your status right now.";
  return `Here's how you're doing: ${parts.join(', ')}.`;
}
