import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import formbody from '@fastify/formbody';
import {
  verifyAlexaRequest,
  AlexaRequestVerificationError,
  plainTextResponse,
  linkAccountResponse,
  NOT_LINKED_SPEECH,
  type RequestEnvelope,
} from '@moodsync/integration-alexa';
import { smartHomeConnectionRepository } from '@moodsync/database';
import {
  alexaService,
  AlexaNotConfiguredError,
  InvalidAlexaClientError,
} from '../../../services/alexaService.js';
import { env } from '../../../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Only set within this route file's plugin context (Fastify's
     * per-plugin encapsulation) — the exact raw bytes Amazon signed, kept
     * alongside the parsed JSON since a re-serialized body would not
     * reproduce the same signature. Required by verifyAlexaRequest — see
     * docs/ALEXA_ARCHITECTURE.md §6. */
    rawBody?: Buffer;
  }
}

const authorizeBodySchema = z.object({
  clientId: z.string(),
  redirectUri: z.string().url(),
  scope: z.string(),
  amazonState: z.string(),
});

/** Parses the `Authorization: Basic base64(client_id:client_secret)`
 * header — the `accessTokenScheme: HTTP_BASIC` configured in
 * integrations/alexa/src/skillManifest.template.json. Falls back to
 * body-provided client_id/client_secret (also valid per RFC 6749) for
 * robustness. */
function extractClientCredentials(request: FastifyRequest, body: Record<string, unknown>): { clientId: string; clientSecret: string } | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex !== -1) {
      return { clientId: decoded.slice(0, separatorIndex), clientSecret: decoded.slice(separatorIndex + 1) };
    }
  }
  if (typeof body.client_id === 'string' && typeof body.client_secret === 'string') {
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }
  return null;
}

const tokenBodySchema = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string().optional(),
});

export default async function alexaRoutes(app: FastifyInstance) {
  // Registered only within this plugin's encapsulated context — sibling
  // route files (whoop.ts, hue.ts, etc.) keep Fastify's default JSON
  // parser untouched. See docs/ALEXA_ARCHITECTURE.md §6 for why the raw
  // bytes matter.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body: Buffer, done) => {
    try {
      const parsed = JSON.parse(body.toString('utf8'));
      request.rawBody = body;
      done(null, parsed);
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  await app.register(formbody); // application/x-www-form-urlencoded, required for the RFC 6749 token endpoint

  /** Step 5 of docs/ALEXA_ARCHITECTURE.md §4 — called by the frontend
   * consent page, authenticated as the logged-in MoodSync user, after
   * they approve linking Alexa to their account. */
  app.post('/integrations/alexa/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const redirectUrl = await alexaService.completeAuthorization({
        userId: request.userId!,
        clientId: parsed.data.clientId,
        redirectUri: parsed.data.redirectUri,
        scope: parsed.data.scope,
        amazonState: parsed.data.amazonState,
      });
      return reply.send({ redirectUrl });
    } catch (error) {
      if (error instanceof AlexaNotConfiguredError) return reply.code(503).send({ error: error.message });
      if (error instanceof InvalidAlexaClientError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  /** The OAuth 2.0 token endpoint — called directly by Amazon's servers,
   * never the browser. Public (no MoodSync session), authenticated
   * instead via client credentials per RFC 6749. */
  app.post('/integrations/alexa/token', async (request, reply) => {
    const bodyRecord = (request.body ?? {}) as Record<string, unknown>;
    const parsed = tokenBodySchema.safeParse(bodyRecord);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

    const credentials = extractClientCredentials(request, bodyRecord);
    if (!credentials) return reply.code(401).send({ error: 'invalid_client' });

    try {
      const result = await alexaService.issueToken({
        grantType: parsed.data.grant_type,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        code: parsed.data.code,
        redirectUri: parsed.data.redirect_uri,
        refreshToken: parsed.data.refresh_token,
      });
      // Standard OAuth 2.0 token response shape (RFC 6749 §5.1).
      return reply.send({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: result.expiresInSeconds,
      });
    } catch (error) {
      if (error instanceof AlexaNotConfiguredError) return reply.code(503).send({ error: 'temporarily_unavailable' });
      if (error instanceof InvalidAlexaClientError) return reply.code(400).send({ error: 'invalid_grant' });
      throw error;
    }
  });

  /** The actual voice-command webhook Amazon's Alexa service calls on
   * every spoken interaction — see docs/ALEXA_ARCHITECTURE.md §3/§6. */
  app.post('/alexa/skill', async (request, reply) => {
    const signatureCertChainUrl = request.headers.signaturecertchainurl;
    const signature = request.headers['signature-256'] ?? request.headers.signature;

    if (typeof signatureCertChainUrl !== 'string' || typeof signature !== 'string' || !request.rawBody) {
      return reply.code(400).send({ error: 'Missing required signature headers' });
    }

    const envelope = request.body as RequestEnvelope;

    try {
      await verifyAlexaRequest({
        signatureCertChainUrl,
        signature,
        rawBody: request.rawBody,
        requestTimestamp: envelope.request.timestamp,
      });
    } catch (error) {
      if (error instanceof AlexaRequestVerificationError) {
        request.log.warn({ err: error }, 'Rejected unverified Alexa request');
        return reply.code(400).send({ error: 'Request verification failed' });
      }
      throw error;
    }

    return reply.send(await routeVerifiedRequest(envelope));
  });

  /** Dev/testing only — exercises the exact same intent-handling logic
   * (`alexaService.handleIntentRequest`) the real signature-verified
   * webhook uses, but authenticated with a normal MoodSync session JWT
   * instead of an Alexa request signature. This exists because there is
   * no way to obtain a genuine Amazon-signed request in development
   * (SignatureCertChainUrl pointing at a real S3-hosted cert, a real
   * Signature-256 value) without an active, certified skill — see
   * scripts/demoAlexaVoiceCommand.mjs and
   * docs/ALEXA_ARCHITECTURE.md §5. Gated out entirely in production:
   * this must never become a second, unauthenticated-by-Alexa path into
   * intent handling on a real deployment. */
  if (env.NODE_ENV !== 'production') {
    app.post('/integrations/alexa/demo-intent', { preHandler: app.authenticate }, async (request, reply) => {
      const parsed = z.object({ intentName: z.string() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const response = await alexaService.handleIntentRequest(request.userId!, parsed.data.intentName);
      return reply.send(response);
    });
  }

  /** Disconnect from the dashboard — revokes the MoodSync-side connection
   * record only; the underlying Alexa account link itself is only fully
   * revocable from the Alexa app (same asymmetry noted for Apple Health's
   * HealthKit grant — see docs/APPLE_HEALTH_ARCHITECTURE.md §9, called
   * out again for Alexa in the dashboard card copy). */
  app.delete('/integrations/alexa', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(request.userId!, 'ALEXA');
    if (!connection) return reply.code(404).send({ error: 'No Alexa connection for this user' });

    await smartHomeConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}

async function routeVerifiedRequest(envelope: RequestEnvelope) {
  if (envelope.request.type === 'SessionEndedRequest') {
    return plainTextResponse('', true);
  }

  const accessToken = envelope.context.System.user.accessToken;
  const userId = await alexaService.resolveUserId(accessToken);

  if (envelope.request.type === 'LaunchRequest') {
    if (!userId) return linkAccountResponse(NOT_LINKED_SPEECH);
    return alexaService.handleGetStatus(userId);
  }

  // IntentRequest
  if (!userId) return linkAccountResponse(NOT_LINKED_SPEECH);
  return alexaService.handleIntentRequest(userId, envelope.request.intent.name);
}
