/**
 * Hand-typed from Amazon's confirmed JSON reference
 * (developer.amazon.com/en-US/docs/alexa/custom-skills/request-and-response-json-reference.html
 * and .../request-types-reference.html) — deliberately not a dependency
 * on `ask-sdk-core`, matching this project's existing pattern of
 * hand-rolled types/clients for every other provider rather than a vendor
 * SDK. Only the fields this integration actually reads/writes are typed;
 * everything else is left as `unknown` rather than guessed at.
 */

export interface AlexaApplication {
  applicationId: string;
}

export interface AlexaUser {
  userId: string;
  /** Present only once the user has completed account linking — see
   * docs/ALEXA_ARCHITECTURE.md §4. */
  accessToken?: string;
}

export interface AlexaDevice {
  deviceId: string;
  supportedInterfaces: Record<string, unknown>;
}

export interface AlexaSystemContext {
  application: AlexaApplication;
  user: AlexaUser;
  device?: AlexaDevice;
  apiEndpoint?: string;
  apiAccessToken?: string;
}

export interface AlexaSession {
  new: boolean;
  sessionId: string;
  application: AlexaApplication;
  attributes?: Record<string, unknown>;
  user: AlexaUser;
}

export interface AlexaSlot {
  name: string;
  value?: string;
  confirmationStatus: 'NONE' | 'CONFIRMED' | 'DENIED';
}

export interface AlexaIntent {
  name: string;
  confirmationStatus: 'NONE' | 'CONFIRMED' | 'DENIED';
  slots?: Record<string, AlexaSlot>;
}

interface BaseRequest {
  requestId: string;
  timestamp: string;
  locale: string;
}

export interface LaunchRequest extends BaseRequest {
  type: 'LaunchRequest';
}

export interface IntentRequest extends BaseRequest {
  type: 'IntentRequest';
  dialogState?: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  intent: AlexaIntent;
}

export interface SessionEndedRequest extends BaseRequest {
  type: 'SessionEndedRequest';
  reason: 'USER_INITIATED' | 'ERROR' | 'EXCEEDED_MAX_REPROMPTS';
  error?: { type: string; message: string };
}

export type AlexaRequest = LaunchRequest | IntentRequest | SessionEndedRequest;

/** The full envelope Amazon POSTs to `/api/alexa/skill` — see
 * docs/ALEXA_ARCHITECTURE.md §3. */
export interface RequestEnvelope {
  version: string;
  session?: AlexaSession;
  context: { System: AlexaSystemContext } & Record<string, unknown>;
  request: AlexaRequest;
}

export interface OutputSpeech {
  type: 'PlainText' | 'SSML';
  text?: string;
  ssml?: string;
}

export interface LinkAccountCard {
  type: 'LinkAccount';
}

export interface SimpleCard {
  type: 'Simple';
  title: string;
  content: string;
}

export type AlexaCard = LinkAccountCard | SimpleCard;

export interface AlexaResponse {
  outputSpeech?: OutputSpeech;
  card?: AlexaCard;
  shouldEndSession: boolean;
}

/** What a skill handler returns — matches Amazon's documented response
 * envelope shape exactly (`version`, `response`), see
 * docs/ALEXA_ARCHITECTURE.md §3. */
export interface ResponseEnvelope {
  version: '1.0';
  sessionAttributes?: Record<string, unknown>;
  response: AlexaResponse;
}

export function plainTextResponse(text: string, shouldEndSession = true): ResponseEnvelope {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession,
    },
  };
}

/** Alexa's documented mechanism for prompting account linking directly in
 * the Alexa app, rather than a spoken error — see
 * docs/ALEXA_ARCHITECTURE.md §7. */
export function linkAccountResponse(text: string): ResponseEnvelope {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      card: { type: 'LinkAccount' },
      shouldEndSession: true,
    },
  };
}
