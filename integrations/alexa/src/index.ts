import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Custom Alexa Skill — confirmed the right fit over a Smart Home Skill
 * during this integration's design pass (Smart Home Skills are
 * documented as unsuitable for conversational queries like "how am I
 * doing today"). Buildable and testable today (signature verification,
 * OAuth-as-authorization-server flow, intent handlers) without an Amazon
 * Developer account; publishing requires one — see
 * docs/ALEXA_DEVELOPER_GUIDE.md.
 */
export const alexaIntegrationStatus: IntegrationStatus = {
  id: 'alexa',
  displayName: 'Amazon Alexa',
  availability: 'available',
};

export {
  type RequestEnvelope,
  type ResponseEnvelope,
  type AlexaRequest,
  type LaunchRequest,
  type IntentRequest,
  type SessionEndedRequest,
  type AlexaIntent,
  type AlexaSlot,
  plainTextResponse,
  linkAccountResponse,
} from './types.js';

export {
  verifyAlexaRequest,
  validateCertChainUrl,
  validateTimestamp,
  AlexaRequestVerificationError,
  type VerifyAlexaRequestParams,
  type CertChainFetcher,
} from './verifyRequest.js';

export {
  signAlexaAuthCode,
  verifyAlexaAuthCode,
  InvalidAlexaAuthCodeError,
  type AlexaAuthCodePayload,
} from './authCode.js';

export {
  signAlexaAccessToken,
  verifyAlexaAccessToken,
  generateAlexaRefreshToken,
  InvalidAlexaAccessTokenError,
  type AlexaAccessTokenPayload,
} from './skillToken.js';

export {
  ALEXA_INTENTS,
  NAMED_RULE_INTENT_KEYWORDS,
  HELP_SPEECH,
  STOP_SPEECH,
  FALLBACK_SPEECH,
  NOT_LINKED_SPEECH,
  NO_SECURITY_INTEGRATION_SPEECH,
  type AlexaIntentName,
} from './intents.js';
