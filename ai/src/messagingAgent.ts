/**
 * The channel-agnostic conversational layer for MoodSync-over-messaging.
 *
 * This module deliberately knows nothing about iMessage, SMS, WhatsApp
 * or any provider. It takes an inbound message plus who sent it, and
 * decides what should happen. The transport is a detail handled in
 * `backend/src/services/messagingService.ts`, which is what makes the
 * bot survive a change of provider — and, given that Apple has no
 * public iMessage API (see docs/MESSAGING_BOT.md), a change of provider
 * is likely.
 *
 * Open-ended questions are delegated to Clara — the grounded, tool-
 * calling assistant in `ai/src/agenticMessaging.ts`, built on the
 * real-data system prompt in `ai/src/claraChat.ts`. Everything this
 * module answers itself is deterministic — commands, safety, and the
 * unverified/opted-out paths — because those are exactly the answers
 * that must never be improvised by a language model.
 */

export type InboundIntent =
  | 'stop'
  | 'start'
  | 'help'
  | 'crisis'
  | 'status'
  | 'verify'
  | 'log_caffeine'
  | 'question';

export interface InboundClassification {
  intent: InboundIntent;
  /** For `verify`, the 6-digit code the user texted back. */
  code?: string;
  /** For `log_caffeine`, the milligrams to record. */
  mg?: number;
}

/**
 * Texting "coffee" is the single lowest-friction way to log something —
 * far easier than unlocking a phone and opening an app, which is the
 * whole reason a health bot is worth having.
 *
 * mg values match the drink presets already used in the app's caffeine
 * logger (USDA / Mayo Clinic typical-serving figures). They are
 * approximate servings, not measurements of what the user drank — the
 * same caveat `CaffeineLog`'s schema comment carries.
 *
 * Exported so `messagingTools.ts`'s `log_caffeine_intake` tool logs the
 * exact same mg figures the regex classifier below would have used —
 * one preset table, whether the drink was matched by keyword here or
 * picked by the model as a tool argument.
 */
export const CAFFEINE_DRINK_PRESETS: Record<string, number> = {
  double_espresso: 126,
  espresso: 63,
  energy_drink: 80,
  tea: 47,
  coffee: 95,
};

const CAFFEINE_DRINKS: Array<{ pattern: RegExp; mg: number }> = [
  { pattern: /\b(?:double|large|two)\s+espressos?\b/, mg: CAFFEINE_DRINK_PRESETS.double_espresso! },
  { pattern: /\bespressos?\b/, mg: CAFFEINE_DRINK_PRESETS.espresso! },
  { pattern: /\b(?:energy\s+drink|red\s?bull|monster)\b/, mg: CAFFEINE_DRINK_PRESETS.energy_drink! },
  { pattern: /\b(?:matcha|green\s+tea|tea)\b/, mg: CAFFEINE_DRINK_PRESETS.tea! },
  { pattern: /\b(?:coffee|latte|cappuccino|americano|cold\s?brew|flat\s+white)\b/, mg: CAFFEINE_DRINK_PRESETS.coffee! },
];

/** Only treat a drink mention as a log when the message reads like a
 * report rather than a question. "just had a coffee" logs; "should I
 * have a coffee?" must not. */
const LOG_VERB = /\b(?:had|drank|having|just\s+had|logged|log|drinking|finished)\b/;

/** Modal and intention constructions that turn a reporting verb into a
 * plan. "I need to stop drinking coffee so late" contains "drinking"
 * and "coffee" but is a resolution, not a log — silently recording
 * 95mg there would corrupt the energy meter with a drink that was never
 * had. Found by a test, not by inspection. */
const INTENT_NOT_REPORT = /\b(?:need|want|going|have|trying|ought|plan|supposed)\s+to\b|\bshould\b|\bwill\b|\bmight\b/;

/**
 * Phrases that route a message straight to crisis resources.
 *
 * This is a **blunt keyword filter, not clinical triage.** It is
 * deliberately biased toward false positives: showing someone a crisis
 * line when they were being figurative costs them one message, and
 * missing a real disclosure costs far more. It exists because a
 * wellness bot that answers "I want to end things" with a breathing
 * exercise would be actively harmful.
 *
 * Phrases are matched on word boundaries against the normalized text.
 * Figurative near-misses that must NOT match ("this workout is killing
 * me", "dying to go to sleep", "I'd kill for a coffee") are covered by
 * tests.
 */
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)?\s+myself\b/,
  /\bkill\s+me\s+now\b/,
  /\bend\s+(?:my\s+life|it\s+all|things)\b/,
  /\b(?:want|going|plan)\s+to\s+die\b/,
  /\bsuicid(?:e|al)\b/,
  /\bhurt(?:ing)?\s+myself\b/,
  /\bharm(?:ing)?\s+myself\b/,
  /\bself[-\s]harm\b/,
  /\bdon'?t\s+want\s+to\s+(?:be\s+here|live|wake\s+up)\b/,
  /\bno\s+reason\s+to\s+live\b/,
];

/** Exact-word opt-out keywords. These are the ones carriers and
 * messaging providers treat as mandatory opt-out in the US, so honoring
 * them is table stakes rather than a nicety. */
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
const START_WORDS = new Set(['start', 'unstop', 'yes', 'resume']);
const HELP_WORDS = new Set(['help', 'info']);
/** Short phrases that should get the cheap deterministic status reply
 * rather than a round trip to a language model. */
const STATUS_PATTERNS: RegExp[] = [
  /^(?:status|how\s+am\s+i(?:\s+doing)?|my\s+(?:stats|numbers|readiness|energy)|check\s+in)\??$/,
];

function normalize(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Decides what an inbound message is. Order matters: crisis is checked
 * before everything else so it can never be shadowed by a message that
 * also happens to contain a command word.
 */
export function classifyInbound(body: string): InboundClassification {
  const text = normalize(body);
  const bare = text.replace(/[.!?,]+$/, '');

  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) return { intent: 'crisis' };

  if (STOP_WORDS.has(bare)) return { intent: 'stop' };
  if (START_WORDS.has(bare)) return { intent: 'start' };
  if (HELP_WORDS.has(bare)) return { intent: 'help' };

  // A bare 6-digit number is a verification code, not a question.
  const codeMatch = bare.match(/^(\d{6})$/);
  if (codeMatch?.[1]) return { intent: 'verify', code: codeMatch[1] };

  if (STATUS_PATTERNS.some((pattern) => pattern.test(bare))) return { intent: 'status' };

  // Logging only fires on a reporting verb, so "should I have a coffee?"
  // stays a question rather than silently logging 95mg.
  if (LOG_VERB.test(bare) && !bare.includes('?') && !INTENT_NOT_REPORT.test(bare)) {
    const drink = CAFFEINE_DRINKS.find((entry) => entry.pattern.test(bare));
    if (drink) return { intent: 'log_caffeine', mg: drink.mg };
  }

  return { intent: 'question' };
}

/**
 * US crisis resources. Hardcoded rather than looked up because this
 * reply must work when every other dependency is down, and because a
 * number fetched at runtime is a number that can be wrong.
 *
 * US-only is a real, stated limitation — see docs/MESSAGING_BOT.md.
 * Serving non-US users correctly needs per-region resources this
 * project doesn't have yet, so the copy avoids implying it covers
 * everywhere.
 */
export const CRISIS_REPLY =
  "I'm not able to help with this, and I don't want to give you a wellness tip right now — that wouldn't be right.\n\n" +
  'If you are in the US you can call or text 988 (Suicide & Crisis Lifeline), any time, free. ' +
  'If you are somewhere else, findahelpline.com lists services by country.\n\n' +
  "If you're in immediate danger, please call your local emergency number.";

export const STOP_REPLY =
  "You're unsubscribed. MoodSync won't message you here again.\n\nText START any time if you change your mind.";

export const START_REPLY = "You're back on. Text HELP to see what I can do.";

export const HELP_REPLY =
  "Clara here — MoodSync's assistant. Things you can text me:\n" +
  '• "how am I doing" — your readiness, energy and sleep right now\n' +
  '• "just had a coffee" — logs it against your energy meter\n' +
  '• any question about your data — "why am I tired?", "should I train today?"\n' +
  '• STOP to unsubscribe\n\n' +
  "I only know what your connected devices tell me, and I'll say so when I don't know. " +
  "I'm not a doctor and can't give medical advice.";

export const UNVERIFIED_REPLY =
  "I don't recognize this number yet. Open MoodSync → Settings → Connections, add this number, and text me back the 6-digit code.";

export const OPTED_OUT_REPLY = 'You previously unsubscribed. Text START to turn messages back on.';

/**
 * Replies MoodSync produces without calling a language model.
 *
 * `null` means "this needs Clara" — the caller then runs the real
 * grounded agentic path. Splitting it this way means the safety-critical
 * and command replies are pure functions with tests, not prompt
 * behavior that could drift between model versions.
 */
export function deterministicReply(classification: InboundClassification): string | null {
  switch (classification.intent) {
    case 'crisis':
      return CRISIS_REPLY;
    case 'stop':
      return STOP_REPLY;
    case 'start':
      return START_REPLY;
    case 'help':
      return HELP_REPLY;
    default:
      return null;
  }
}

export interface StatusSnapshot {
  readiness: number | null;
  energy: number | null;
  sleep: number | null;
  /** The one-line "focus on today" from the daily brief, when there is
   * one. */
  focusToday: string | null;
}

/**
 * The "how am I doing" reply, built from real numbers with no model in
 * the loop. Missing values are stated as missing — the same rule the
 * rest of the app follows — rather than dropped, so a reply that looks
 * thin is legibly thin rather than quietly incomplete.
 */
export function buildStatusReply(snapshot: StatusSnapshot): string {
  const parts: string[] = [];
  parts.push(snapshot.readiness === null ? 'Readiness: no data yet' : `Readiness ${snapshot.readiness}/100`);
  parts.push(snapshot.energy === null ? 'Energy: no data yet' : `Energy ${snapshot.energy}/100`);
  parts.push(snapshot.sleep === null ? 'Sleep: no data yet' : `Sleep ${snapshot.sleep}/100`);

  const head = parts.join(' · ');
  if (snapshot.readiness === null && snapshot.energy === null && snapshot.sleep === null) {
    return `${head}\n\nNothing has synced from a wearable yet — connect one in the app and this fills in.`;
  }
  return snapshot.focusToday ? `${head}\n\n${snapshot.focusToday}` : head;
}

/** Hard ceiling on an outbound reply. Messaging surfaces are not
 * dashboards: a wall of text in a chat thread reads as spam, and most
 * providers segment (and bill) long messages anyway. Clara is told to
 * be brief in the prompt; this is the backstop when it isn't. */
export const MAX_REPLY_CHARS = 600;

/**
 * Trims a reply to `MAX_REPLY_CHARS` at a sentence boundary where one
 * exists, so a truncated message ends like a sentence rather than
 * mid-word. Never appends an ellipsis to a reply that already fits.
 */
export function shapeReply(reply: string, maxChars: number = MAX_REPLY_CHARS): string {
  const trimmed = reply.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const window = trimmed.slice(0, maxChars);
  const lastSentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf('! '), window.lastIndexOf('? '));
  // Only cut at a sentence boundary if it isn't so early that we'd throw
  // away most of the reply.
  if (lastSentenceEnd > maxChars * 0.5) return window.slice(0, lastSentenceEnd + 1).trim();
  return `${window.trimEnd()}…`;
}

/**
 * The instruction appended to Clara's system prompt when it's answering
 * over a messaging channel rather than the in-app chat. Same grounding,
 * different register: a text thread is not a dashboard.
 */
export const MESSAGING_STYLE_PROMPT =
  'You are replying in a text-message thread, not a web app. Keep it under 4 short sentences. ' +
  'No markdown, no bullet lists, no headings — plain sentences only. ' +
  // Every rule below this line used to be a prohibition, and the replies
  // showed it: told only what not to say, the model played safe and said
  // nothing specific ("take it easy" for a question it had real recovery
  // and sleep numbers to answer). Grounding has to be an instruction to
  // cite, not just a ban on inventing.
  'When a tool gave you real figures, say them: "recovery is 62, sleep 71" lands where "you seem under-recovered" does not. ' +
  'Answer the question that was actually asked, then stop — no unprompted checklists or follow-up questions. ' +
  'Never invent a number. If the data is missing, say so plainly and name the one thing that would fix it. ' +
  'Do not give medical advice or diagnose anything.';

/** Confirmation after logging caffeine by text. States the estimate
 * explicitly — the user said "coffee", not "95mg", and the difference
 * matters if they later wonder why the number looks off. */
export function buildCaffeineLogReply(mg: number, energyAfter: number | null): string {
  const head = `Logged ~${mg}mg of caffeine.`;
  if (energyAfter === null) return `${head} Connect a wearable and I can show what it does to your energy.`;
  return `${head} Energy now ${energyAfter}/100.`;
}

/**
 * A proactive health nudge, sent unprompted.
 *
 * Deliberately narrow: MoodSync only interrupts someone's day for a
 * signal that already cleared the conservative burnout conjunction (see
 * ai/src/proactiveNotifications.ts). Every nudge ends with the opt-out,
 * because an unsolicited health message that doesn't is spam.
 */
export function buildProactiveNudge(title: string, body: string): string {
  return shapeReply(`${title}\n\n${body}\n\nText STOP to turn these off.`);
}
