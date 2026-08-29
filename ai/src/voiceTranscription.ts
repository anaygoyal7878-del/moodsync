import { GoogleGenAI } from '@google/genai';
import { ClaraNotConfiguredError } from './claraChat.js';
import { withGeminiRetry } from './geminiRetry.js';

/**
 * Turns a voice message into text, so it can enter the exact same
 * pipeline a typed message does — `classifyInbound`'s crisis detection,
 * verification, and every other check in `messagingService.handleInbound`
 * run on the *transcript*, never on raw audio. Sending audio straight
 * into the agentic model and skipping those checks was considered and
 * rejected: crisis detection in this codebase is a blunt keyword filter
 * over text, and it "must never be improvised by a model, ever" (see
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md's routing table) — that
 * guarantee only holds if every inbound message becomes text before
 * anything else touches it. This module is that step, and nothing
 * downstream of it needs to know a message ever wasn't text.
 *
 * Uses Gemini's own audio understanding rather than a second transcription
 * vendor — one model already in this stack, one API key, one place a
 * "not configured" error can come from, and Gemini's per-second-of-audio
 * token cost is small relative to the model calls already made per
 * conversation turn.
 */

const MODEL = 'gemini-flash-latest';

export class TranscriptionError extends Error {}

/**
 * MIME types Gemini's `generateContent` documents support for inline
 * audio. Checked here, before spending a model call, because Apple's
 * own voice-memo format (CAF — Core Audio Format) is genuinely NOT in
 * this list, and whether a BlueBubbles-cached inbound voice message
 * arrives as CAF or something Gemini accepts has never been confirmed
 * against a live server in this environment (see docs/MESSAGING_AGENTIC_ARCHITECTURE.md's
 * "Known gaps"). Rejecting an unsupported format with a clear reason is
 * the honest behavior; silently mangling or guessing is not.
 */
export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/webm',
]);

export function isSupportedAudioMimeType(mimeType: string): boolean {
  return SUPPORTED_AUDIO_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Transcribes one voice message. Throws `TranscriptionError` for an
 * unsupported format or an empty/failed transcription — the caller
 * (`messagingService`) is responsible for turning that into a plain
 * reply telling the person what happened, never a silent drop.
 */
export async function transcribeVoiceMessage(audio: { data: Buffer; mimeType: string }): Promise<string> {
  if (!isSupportedAudioMimeType(audio.mimeType)) {
    throw new TranscriptionError(`Unsupported audio format: ${audio.mimeType}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ClaraNotConfiguredError();

  const client = new GoogleGenAI({ apiKey });
  const response = await withGeminiRetry(
    () =>
      client.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcribe this voice message verbatim, in the language it was spoken. Return only the transcription — no preamble, no description of tone or background noise, no quotation marks around it.',
              },
              { inlineData: { mimeType: audio.mimeType, data: audio.data.toString('base64') } },
            ],
          },
        ],
      }),
    'clara.transcribe',
  );

  const text = response.text?.trim();
  if (!text) throw new TranscriptionError('Transcription returned no text');
  return text;
}
