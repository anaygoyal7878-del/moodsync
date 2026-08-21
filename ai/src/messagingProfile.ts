/**
 * Compiles a per-conversation profile from what MoodSync has actually
 * observed of this person — then renders it into the slice of system
 * prompt that makes one chat's agent different from another's.
 *
 * The design principle: **the prompt is compiled, not templated.** Two
 * users texting the same sentence should get materially different
 * agents behind the reply, assembled from three separately-sourced
 * inputs that are deliberately never mixed:
 *
 *  1. **Declared** — facts the model chose to save via `remember_fact`.
 *     Someone (a model reading a person's words) asserted these.
 *  2. **Observed** — traits measured here from the real message log.
 *     Nobody asserted them; they're counted.
 *  3. **Capability** — what this account actually has connected, which
 *     decides the tool surface (see `selectMessagingTools`).
 *
 * Declared and observed stay labelled separately all the way into the
 * prompt, because they license different phrasing. "You told me you
 * train in the mornings" and "you tend to text me at night" are
 * different epistemic claims, and a model that can't tell them apart
 * will state the second with the confidence of the first.
 *
 * ## The credibility rule: a plurality is not a pattern
 *
 * Every trait here is suppressed — returns null, not a low-confidence
 * guess — until it clears both a sample-size floor and a *dominance*
 * floor. A 22% plurality across five time-of-day bands is what random
 * noise looks like; reporting it as "texts mostly in the evening"
 * would be fabricating a pattern out of nothing and then letting the
 * model repeat it back as if MoodSync knew something. Null here means
 * the prompt simply says nothing about that dimension, which is the
 * honest state of knowledge for most new conversations.
 *
 * This mirrors `environmentLearning.ts`'s MIN_SESSIONS_FOR_FINDING and
 * the personal-baseline rule in `personalBaselines.ts`: MoodSync does
 * not claim to know someone from three data points.
 */

/** Below this many inbound messages, no behavioural trait is derived at
 * all — the conversation is still a cold start and the profile says so
 * explicitly rather than characterizing someone from a handful of
 * texts. */
export const MIN_MESSAGES_FOR_TRAITS = 8;

/** A time-of-day band must hold at least this share of a person's
 * messages before it counts as "when they text". Five bands means
 * chance alone puts ~20% in each; 40% is a real concentration. */
export const MIN_BAND_DOMINANCE = 0.4;

/** An intent must recur at least this often before it's called an
 * interest. Twice is a coincidence. */
export const MIN_INTENT_COUNT = 3;

/** Hard ceiling on the rendered profile block. The whole point of
 * compiling rather than dumping is that per-conversation context earns
 * its tokens; without a budget this grows unboundedly as a
 * relationship ages and quietly becomes the most expensive part of
 * every request. */
export const PROFILE_BLOCK_BUDGET_CHARS = 1200;

export type ReplyLength = 'terse' | 'brief' | 'standard';
export type ActiveBand = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night';

export const BAND_LABELS: Record<ActiveBand, string> = {
  early_morning: 'early morning',
  morning: 'the morning',
  afternoon: 'the afternoon',
  evening: 'the evening',
  night: 'late at night',
};

/** A measured trait always travels with the count behind it. A trait
 * without its sample size is an assertion; with it, it's evidence. */
export interface ProfileTrait<T> {
  value: T;
  sampleSize: number;
}

export interface InboundRecord {
  body: string;
  /** The classified intent stored on the row (see messagingAgent.ts). */
  intent: string | null;
  createdAt: Date;
}

export interface DeclaredFact {
  fact: string;
  /** How many times the model has independently re-saved this. A fact
   * arrived at repeatedly is worth more prompt space than one saved
   * once six weeks ago. */
  reinforcedCount: number;
  lastReinforcedAt: Date;
}

export interface ConversationProfile {
  /** True until the conversation clears MIN_MESSAGES_FOR_TRAITS. Not
   * the same as "no traits found" — this distinguishes "we haven't
   * talked enough yet" from "we've talked plenty and you're just not
   * predictable", which are different things to tell a model. */
  stillLearning: boolean;
  totalInbound: number;
  /** How long this reply should be, matched to how *they* write. */
  replyLength: ProfileTrait<ReplyLength> | null;
  /** When they actually text, in their own timezone. */
  activeBand: ProfileTrait<ActiveBand> | null;
  /** Intents that genuinely recur for this person. */
  recurringInterests: ProfileTrait<string[]> | null;
}

function bandFor(hour: number): ActiveBand {
  if (hour < 6) return 'night';
  if (hour < 10) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/** Same `Intl.DateTimeFormat` approach `ruleEngine.ts` uses — the
 * caller shouldn't have to pre-localize timestamps, and an invalid
 * timezone falls back to UTC rather than throwing mid-reply. */
function localHour(date: Date, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date));
  } catch {
    return date.getUTCHours();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median, not mean, on purpose: one pasted paragraph shouldn't
 * reclassify a person who otherwise texts in fragments.
 */
function deriveReplyLength(bodies: string[]): ReplyLength {
  const typical = median(bodies.map((b) => b.trim().length));
  if (typical <= 25) return 'terse';
  if (typical <= 80) return 'brief';
  return 'standard';
}

/** Intents that describe the *mechanics* of the channel rather than
 * anything this person is interested in. "They ask for help a lot" is
 * not a personality insight, and 'question' is the catch-all bucket
 * every unmatched message lands in — neither says anything. */
const NON_INTEREST_INTENTS = new Set(['question', 'help', 'verify', 'start', 'stop', 'crisis']);

export function compileConversationProfile(
  inbound: InboundRecord[],
  timeZone: string,
): ConversationProfile {
  const total = inbound.length;
  if (total < MIN_MESSAGES_FOR_TRAITS) {
    return { stillLearning: true, totalInbound: total, replyLength: null, activeBand: null, recurringInterests: null };
  }

  const bodies = inbound.map((m) => m.body).filter((b) => b.trim().length > 0);
  const replyLength: ProfileTrait<ReplyLength> | null =
    bodies.length >= MIN_MESSAGES_FOR_TRAITS
      ? { value: deriveReplyLength(bodies), sampleSize: bodies.length }
      : null;

  // Time-of-day: only reported when one band genuinely dominates.
  const bandCounts = new Map<ActiveBand, number>();
  for (const m of inbound) {
    const band = bandFor(localHour(m.createdAt, timeZone));
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }
  let activeBand: ProfileTrait<ActiveBand> | null = null;
  for (const [band, count] of bandCounts) {
    if (count / total >= MIN_BAND_DOMINANCE && (activeBand === null || count > activeBand.sampleSize)) {
      activeBand = { value: band, sampleSize: count };
    }
  }

  const intentCounts = new Map<string, number>();
  for (const m of inbound) {
    if (!m.intent || NON_INTEREST_INTENTS.has(m.intent)) continue;
    intentCounts.set(m.intent, (intentCounts.get(m.intent) ?? 0) + 1);
  }
  const recurring = [...intentCounts.entries()]
    .filter(([, count]) => count >= MIN_INTENT_COUNT)
    .sort((a, b) => b[1] - a[1])
    .map(([intent]) => intent);
  const recurringInterests: ProfileTrait<string[]> | null =
    recurring.length > 0
      ? { value: recurring, sampleSize: recurring.reduce((sum, i) => sum + (intentCounts.get(i) ?? 0), 0) }
      : null;

  return { stillLearning: false, totalInbound: total, replyLength, activeBand, recurringInterests };
}

/**
 * Orders declared facts by how much prompt space each has earned:
 * reinforcement first (the model keeps independently concluding this),
 * recency as the tiebreak. Pure and exported so the ranking rule is
 * testable without a database.
 */
export function rankDeclaredFacts(facts: DeclaredFact[]): DeclaredFact[] {
  return [...facts].sort((a, b) => {
    if (b.reinforcedCount !== a.reinforcedCount) return b.reinforcedCount - a.reinforcedCount;
    return b.lastReinforcedAt.getTime() - a.lastReinforcedAt.getTime();
  });
}

const LENGTH_INSTRUCTION: Record<ReplyLength, string> = {
  terse: 'They text in fragments. Answer in one short sentence — anything longer reads as a lecture to them.',
  brief: 'They text briefly. Two sentences at most.',
  standard: 'They write in full sentences and will read a real answer. Up to four short sentences.',
};

/**
 * Renders the compiled profile into prompt text, under a hard budget.
 *
 * Observed traits are phrased as observations ("you've noticed") and
 * declared facts as things they told you — the labelling is the point,
 * not decoration. A model handed both as one undifferentiated list
 * will confidently tell someone "you prefer evenings" when all
 * MoodSync ever did was count timestamps.
 *
 * Returns an empty string when there is nothing credible to say, so a
 * brand-new conversation costs zero extra tokens rather than carrying
 * a paragraph explaining that MoodSync knows nothing yet.
 */
export function renderProfileBlock(
  profile: ConversationProfile,
  facts: DeclaredFact[],
  budgetChars: number = PROFILE_BLOCK_BUDGET_CHARS,
): string {
  const lines: string[] = [];

  if (profile.replyLength) lines.push(LENGTH_INSTRUCTION[profile.replyLength.value]);

  const observed: string[] = [];
  if (profile.activeBand) {
    observed.push(
      `They usually message you in ${BAND_LABELS[profile.activeBand.value]} (${profile.activeBand.sampleSize} of ${profile.totalInbound} messages).`,
    );
  }
  if (profile.recurringInterests) {
    observed.push(`Recurring topics for them: ${profile.recurringInterests.value.join(', ')}.`);
  }
  if (observed.length > 0) {
    lines.push(
      'Observed from this thread (counted, not something they told you — do not state these back as if they had):',
    );
    lines.push(...observed.map((o) => `- ${o}`));
  }

  const ranked = rankDeclaredFacts(facts);
  if (ranked.length > 0) {
    lines.push('What they have actually told you, over past conversations:');
    for (const fact of ranked) {
      const line = `- ${fact.fact}`;
      // Stop at the budget rather than truncating mid-fact — half a
      // remembered fact is worse than one fewer of them.
      if ([...lines, line].join('\n').length > budgetChars) break;
      lines.push(line);
    }
  }

  if (lines.length === 0) return '';
  return `\n\nAbout this specific person:\n${lines.join('\n')}`;
}
