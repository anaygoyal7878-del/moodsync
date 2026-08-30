import { HarmCategory, HarmBlockThreshold, FinishReason, BlockedReason } from '@google/genai';

/**
 * How Clara's Gemini calls are configured, and how their responses are
 * interpreted.
 *
 * Both halves existed only by omission before this file. Every call site
 * passed `{ systemInstruction, ...geminiCallOptions() }` and nothing
 * else, which meant taking the API's defaults for sampling, output
 * length and — the one that actually bit — content safety. And every
 * call site then read `response.text ?? ''`, which silently turns a
 * *blocked* response into an empty string.
 *
 * The empty string was a real, user-visible bug. `ClaraChat` only
 * appends a message when `data.reply` is truthy, so a blocked response
 * produced no assistant bubble at all: the user typed a question,
 * watched "Thinking…", and then watched nothing happen. The failure mode
 * that most needed an explanation was the one that produced silence.
 */

/**
 * Safety thresholds, deliberately not left at their defaults.
 *
 * `HARM_CATEGORY_DANGEROUS_CONTENT` is the load-bearing one. A wellness
 * assistant's ordinary vocabulary — exhaustion, overtraining, sleep
 * deprivation, an elevated heart rate, "should I be worried about this"
 * — sits close enough to the default medium threshold that legitimate
 * health conversation gets blocked. That is precisely the category of
 * question this app exists to answer, so it is loosened to
 * `BLOCK_ONLY_HIGH`.
 *
 * Loosened, not disabled. `BLOCK_NONE` is available and would be the
 * wrong choice for a health product: `BLOCK_ONLY_HIGH` still blocks
 * high-severity content, which is where genuine self-harm and dangerous
 * medical instruction live. The other three categories stay at
 * `BLOCK_MEDIUM_AND_ABOVE`, because nothing about discussing sleep and
 * heart rate requires loosening harassment or hate-speech filtering.
 *
 * When a block does happen, `interpretGeminiResponse` turns it into a
 * plain "I can't help with that" rather than silence — so the cost of
 * keeping these filters on is an explanation, not a dead end.
 */
export const CLARA_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/**
 * Sampling and output bounds.
 *
 * `temperature` at 0.3 rather than the API default of 1.0: Clara's job
 * is to restate someone's own measurements and the thresholds that apply
 * to them. Creative variation is a defect in that job — the same numbers
 * asked about twice should not produce two different characterisations.
 *
 * `maxOutputTokens` at 800 because the prompt asks for short,
 * conversational replies and nothing else here enforced that. It also
 * bounds the cost of a runaway generation, and `MAX_TOKENS` is now
 * surfaced as a truncation rather than passed off as a complete answer.
 */
export const CLARA_GENERATION_CONFIG = {
  temperature: 0.3,
  maxOutputTokens: 800,
  safetySettings: CLARA_SAFETY_SETTINGS,
};

export type GeminiOutcome =
  | { kind: 'ok'; text: string }
  /** The model produced nothing usable and the user must be told why.
   * `userMessage` is written to be shown verbatim. */
  | { kind: 'unavailable'; reason: string; userMessage: string }
  /** Hit the output cap mid-sentence. Text is real and worth showing,
   * but it is not a finished answer and should not be presented as one. */
  | { kind: 'truncated'; text: string };

/** Minimal structural shape of what `generateContent` returns — typed
 * locally rather than importing the SDK's response type, so this stays
 * usable for any call shape and testable without constructing one. */
interface ResponseShape {
  text?: string | undefined;
  promptFeedback?: { blockReason?: string | undefined } | undefined;
  candidates?: Array<{ finishReason?: string | undefined }> | undefined;
}

/** The one message for every "cannot answer" case. Deliberately
 * identical wording regardless of which filter fired: telling a user
 * *which* safety category their question tripped invites them to
 * rephrase around it, and the honest content of the message is the same
 * either way — this particular question is not one Clara will answer. */
const CANNOT_HELP =
  "I can't help with that one right now. If it's a health worry, a clinician is the right place to take it — and if it's about your own data, try asking me about your sleep, recovery, heart rate or stress instead.";

/**
 * Turns a raw Gemini response into an outcome a caller can act on.
 *
 * Checks in order of specificity: a prompt-level block (the whole
 * request was refused before generation), then a candidate-level finish
 * reason (generation started and was cut off), then the fallback of
 * text that is simply absent. The order matters — a safety-blocked
 * response also has empty text, and reporting it as "empty" would lose
 * the reason.
 */
export function interpretGeminiResponse(response: ResponseShape): GeminiOutcome {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason && blockReason !== BlockedReason.BLOCKED_REASON_UNSPECIFIED) {
    return { kind: 'unavailable', reason: `prompt_blocked:${blockReason}`, userMessage: CANNOT_HELP };
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  const text = response.text?.trim() ?? '';

  if (finishReason === FinishReason.MAX_TOKENS) {
    // Only a truncation if something was actually produced. Hitting the
    // cap with no text at all is a failure, not a long answer.
    if (text.length > 0) return { kind: 'truncated', text };
    return { kind: 'unavailable', reason: 'max_tokens_no_text', userMessage: CANNOT_HELP };
  }

  const refusalReasons: string[] = [
    FinishReason.SAFETY,
    FinishReason.BLOCKLIST,
    FinishReason.PROHIBITED_CONTENT,
    FinishReason.SPII,
    FinishReason.RECITATION,
  ];
  if (finishReason && refusalReasons.includes(finishReason)) {
    return { kind: 'unavailable', reason: `finish:${finishReason}`, userMessage: CANNOT_HELP };
  }

  if (text.length === 0) {
    return { kind: 'unavailable', reason: `empty:${finishReason ?? 'none'}`, userMessage: CANNOT_HELP };
  }

  return { kind: 'ok', text };
}

/** Collapses an outcome to the string to show the user. Truncated text
 * gets an ellipsis marker rather than being silently presented as a
 * complete thought. */
export function outcomeToText(outcome: GeminiOutcome): string {
  switch (outcome.kind) {
    case 'ok':
      return outcome.text;
    case 'truncated':
      return `${outcome.text}…\n\n(I ran out of room there — ask me to continue if you want the rest.)`;
    case 'unavailable':
      return outcome.userMessage;
  }
}
