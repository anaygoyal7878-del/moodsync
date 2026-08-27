import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { transcribeVoiceMessage, isSupportedAudioMimeType, TranscriptionError, SUPPORTED_AUDIO_MIME_TYPES } from './voiceTranscription.js';
import { ClaraNotConfiguredError } from './claraChat.js';

/**
 * No live Gemini key in this environment, so — same convention as
 * `claraChat.ts`/`agenticMessaging.ts`, neither of which has a test
 * file — the actual model call is not unit-tested here. What's fully
 * testable without a network call: the format allowlist, and that the
 * format check runs *before* the API-key check (so an unsupported
 * format is rejected even with no key configured, never silently
 * treated as "not configured").
 */

describe('isSupportedAudioMimeType', () => {
  it('accepts every format Gemini documents support for inline audio', () => {
    for (const mimeType of SUPPORTED_AUDIO_MIME_TYPES) {
      expect(isSupportedAudioMimeType(mimeType)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isSupportedAudioMimeType('AUDIO/MP3')).toBe(true);
  });

  it('rejects CAF — Apple’s own voice-memo format, and notably not in Gemini’s supported list', () => {
    // The whole reason this allowlist exists: whether a BlueBubbles-
    // cached inbound voice message actually arrives as CAF or
    // something else has never been confirmed against a live server —
    // see this file's top comment and docs/MESSAGING_AGENTIC_ARCHITECTURE.md.
    expect(isSupportedAudioMimeType('audio/caf')).toBe(false);
    expect(isSupportedAudioMimeType('audio/x-caf')).toBe(false);
  });

  it('rejects a non-audio type', () => {
    expect(isSupportedAudioMimeType('image/png')).toBe(false);
  });
});

describe('transcribeVoiceMessage', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
  });

  it('rejects an unsupported format before ever checking for an API key', async () => {
    // No GEMINI_API_KEY is set in this test on purpose — if this threw
    // ClaraNotConfiguredError instead of TranscriptionError, that would
    // mean the format check ran after the key check, which is the
    // wrong order (an unsupported format should never even reach the
    // "is this configured" question).
    await expect(transcribeVoiceMessage({ data: Buffer.from('x'), mimeType: 'audio/caf' })).rejects.toBeInstanceOf(
      TranscriptionError,
    );
  });

  it('reports not-configured for a supported format with no API key set', async () => {
    await expect(transcribeVoiceMessage({ data: Buffer.from('x'), mimeType: 'audio/mp3' })).rejects.toBeInstanceOf(
      ClaraNotConfiguredError,
    );
  });
});
