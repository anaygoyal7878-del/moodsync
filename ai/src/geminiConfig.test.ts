import { describe, it, expect } from 'vitest';
import {
  interpretGeminiResponse,
  outcomeToText,
  CLARA_SAFETY_SETTINGS,
  CLARA_GENERATION_CONFIG,
} from './geminiConfig.js';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';

describe('interpretGeminiResponse', () => {
  it('passes normal text through', () => {
    expect(interpretGeminiResponse({ text: 'Recovery is 62.', candidates: [{ finishReason: 'STOP' }] })).toEqual({
      kind: 'ok',
      text: 'Recovery is 62.',
    });
  });

  it('turns a safety-blocked prompt into an explanation rather than an empty string', () => {
    // The bug this file exists for. A blocked response has no text, and
    // ClaraChat only renders a bubble for a truthy reply — so this used
    // to produce no assistant message at all: the user asked something,
    // saw "Thinking…", and then saw nothing.
    const outcome = interpretGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' }, text: undefined });
    expect(outcome.kind).toBe('unavailable');
    expect(outcomeToText(outcome)).toContain("can't help with that one");
  });

  it('treats a candidate blocked mid-generation the same way', () => {
    const outcome = interpretGeminiResponse({ text: '', candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] });
    expect(outcome.kind).toBe('unavailable');
  });

  it('reports empty text with no stated reason as unavailable, not as a valid empty answer', () => {
    const outcome = interpretGeminiResponse({ text: '   ', candidates: [{ finishReason: 'STOP' }] });
    expect(outcome.kind).toBe('unavailable');
    expect(outcomeToText(outcome).length).toBeGreaterThan(20);
  });

  it('keeps truncated text but marks it as unfinished', () => {
    // Real content worth showing, but presenting it as a complete answer
    // would mean silently dropping the end of a sentence.
    const outcome = interpretGeminiResponse({ text: 'Your recovery is trending', candidates: [{ finishReason: 'MAX_TOKENS' }] });
    expect(outcome.kind).toBe('truncated');
    expect(outcomeToText(outcome)).toContain('ran out of room');
  });

  it('treats hitting the token cap with no text at all as a failure, not a truncation', () => {
    const outcome = interpretGeminiResponse({ text: '', candidates: [{ finishReason: 'MAX_TOKENS' }] });
    expect(outcome.kind).toBe('unavailable');
  });

  it('prefers the block reason over "empty" when both apply', () => {
    // A blocked response is also textless. Reporting it as empty would
    // throw away the only diagnostic information available.
    const outcome = interpretGeminiResponse({ text: '', promptFeedback: { blockReason: 'BLOCKLIST' } });
    expect(outcome.kind === 'unavailable' && outcome.reason).toContain('prompt_blocked');
  });

  it('ignores the UNSPECIFIED block reason, which is not a block', () => {
    const outcome = interpretGeminiResponse({
      text: 'Fine.',
      promptFeedback: { blockReason: 'BLOCKED_REASON_UNSPECIFIED' },
      candidates: [{ finishReason: 'STOP' }],
    });
    expect(outcome).toEqual({ kind: 'ok', text: 'Fine.' });
  });

  it('never names the safety category that fired', () => {
    // Telling someone which filter they tripped is an invitation to
    // rephrase around it, and the honest content is the same either way.
    const message = outcomeToText(interpretGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }));
    expect(message).not.toMatch(/safety|harm|blocklist|prohibited/i);
  });
});

describe('generation config', () => {
  it('loosens only dangerous-content filtering, which is what health talk trips', () => {
    const dangerous = CLARA_SAFETY_SETTINGS.find((s) => s.category === HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT);
    expect(dangerous?.threshold).toBe(HarmBlockThreshold.BLOCK_ONLY_HIGH);
  });

  it('never disables a safety filter outright', () => {
    // BLOCK_NONE/OFF would be the wrong trade for a health product:
    // BLOCK_ONLY_HIGH still blocks self-harm and dangerous medical
    // instruction, which is the point of keeping any threshold at all.
    for (const setting of CLARA_SAFETY_SETTINGS) {
      expect(setting.threshold).not.toBe(HarmBlockThreshold.BLOCK_NONE);
      expect(setting.threshold).not.toBe(HarmBlockThreshold.OFF);
    }
  });

  it('leaves the non-health categories at the stricter default', () => {
    const others = CLARA_SAFETY_SETTINGS.filter((s) => s.category !== HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT);
    expect(others.length).toBe(3);
    for (const setting of others) {
      expect(setting.threshold).toBe(HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE);
    }
  });

  it('pins temperature low, since restating someone’s own numbers is not a creative task', () => {
    expect(CLARA_GENERATION_CONFIG.temperature).toBeLessThanOrEqual(0.4);
    expect(CLARA_GENERATION_CONFIG.maxOutputTokens).toBeGreaterThan(0);
  });
});
