import { describe, expect, it } from 'vitest';
import {
  compileConversationProfile,
  renderProfileBlock,
  rankDeclaredFacts,
  MIN_MESSAGES_FOR_TRAITS,
  type DeclaredFact,
  type InboundRecord,
} from './messagingProfile.js';

/** Builds an inbound record at a fixed UTC hour so band tests are
 * deterministic regardless of where they run. */
function msg(body: string, utcHour: number, intent: string | null = 'question'): InboundRecord {
  return { body, intent, createdAt: new Date(Date.UTC(2026, 7, 20, utcHour, 0, 0)) };
}

function many(count: number, build: (i: number) => InboundRecord): InboundRecord[] {
  return Array.from({ length: count }, (_, i) => build(i));
}

describe('compileConversationProfile — cold start', () => {
  it('derives nothing at all below the message floor, and says so distinctly', () => {
    const profile = compileConversationProfile(many(MIN_MESSAGES_FOR_TRAITS - 1, () => msg('hey', 12)), 'UTC');

    expect(profile.stillLearning).toBe(true);
    expect(profile.replyLength).toBeNull();
    expect(profile.activeBand).toBeNull();
    expect(profile.recurringInterests).toBeNull();
  });

  it('distinguishes "not enough messages" from "enough messages, no pattern"', () => {
    // Evenly spread across bands: plenty of data, genuinely no pattern.
    const spread = [0, 8, 11, 14, 19, 23, 3, 16, 10, 13].map((h) => msg('a message of some length', h));
    const profile = compileConversationProfile(spread, 'UTC');

    expect(profile.stillLearning).toBe(false);
    expect(profile.activeBand).toBeNull();
  });
});

describe('compileConversationProfile — reply length', () => {
  it('reads a fragment-texter as terse', () => {
    const profile = compileConversationProfile(many(10, () => msg('hr?', 12)), 'UTC');
    expect(profile.replyLength?.value).toBe('terse');
  });

  it('reads a full-sentence writer as standard', () => {
    const long = 'I have been feeling pretty wiped out since the weekend and I am wondering what to do about it';
    const profile = compileConversationProfile(many(10, () => msg(long, 12)), 'UTC');
    expect(profile.replyLength?.value).toBe('standard');
  });

  it('uses the median so one pasted paragraph does not reclassify a terse texter', () => {
    const messages = [...many(9, () => msg('yeah', 12)), msg('x'.repeat(2000), 12)];
    const profile = compileConversationProfile(messages, 'UTC');
    expect(profile.replyLength?.value).toBe('terse');
  });

  it('carries the sample size behind the classification', () => {
    const profile = compileConversationProfile(many(12, () => msg('ok', 12)), 'UTC');
    expect(profile.replyLength?.sampleSize).toBe(12);
  });
});

describe('compileConversationProfile — active band', () => {
  it('reports a band only when it genuinely dominates', () => {
    // 8 of 10 late at night — a real concentration.
    const messages = [...many(8, () => msg('still up', 23)), msg('morning', 9), msg('afternoon', 14)];
    const profile = compileConversationProfile(messages, 'UTC');

    expect(profile.activeBand?.value).toBe('night');
    expect(profile.activeBand?.sampleSize).toBe(8);
  });

  it('refuses to call a bare plurality a pattern', () => {
    // 3/10 is the largest group but nowhere near dominant — this is
    // what noise looks like, and reporting it would invent a habit.
    const messages = [
      ...many(3, () => msg('a', 23)),
      ...many(2, () => msg('b', 9)),
      ...many(2, () => msg('c', 14)),
      ...many(2, () => msg('d', 19)),
      msg('e', 11),
    ];
    expect(compileConversationProfile(messages, 'UTC').activeBand).toBeNull();
  });

  it('bands by the user timezone, not UTC', () => {
    // 20:00 UTC is the evening in UTC but midday in Tokyo (+9 → 05:00
    // next day is night; use 03:00 UTC = noon JST).
    const messages = many(10, () => msg('hello there', 3));
    expect(compileConversationProfile(messages, 'UTC').activeBand?.value).toBe('night');
    expect(compileConversationProfile(messages, 'Asia/Tokyo').activeBand?.value).toBe('afternoon');
  });

  it('falls back to UTC rather than throwing on a bad timezone', () => {
    const messages = many(10, () => msg('hello there', 23));
    expect(compileConversationProfile(messages, 'Not/AZone').activeBand?.value).toBe('night');
  });
});

describe('compileConversationProfile — recurring interests', () => {
  it('surfaces an intent that genuinely recurs', () => {
    const messages = [...many(4, () => msg('coffee', 9, 'log_caffeine')), ...many(6, () => msg('hows my sleep', 9))];
    expect(compileConversationProfile(messages, 'UTC').recurringInterests?.value).toEqual(['log_caffeine']);
  });

  it('ignores a one-off intent', () => {
    const messages = [msg('coffee', 9, 'log_caffeine'), ...many(9, () => msg('a question here', 9))];
    expect(compileConversationProfile(messages, 'UTC').recurringInterests).toBeNull();
  });

  it('never reports channel-mechanics intents as interests', () => {
    // Lots of HELP and the catch-all 'question' bucket say nothing
    // about a person.
    const messages = [...many(5, () => msg('help', 9, 'help')), ...many(5, () => msg('what about x', 9, 'question'))];
    expect(compileConversationProfile(messages, 'UTC').recurringInterests).toBeNull();
  });
});

describe('rankDeclaredFacts', () => {
  const at = (d: number) => new Date(Date.UTC(2026, 7, d));

  it('puts repeatedly-reconcluded facts ahead of one-offs', () => {
    const facts: DeclaredFact[] = [
      { fact: 'noted once', reinforcedCount: 1, lastReinforcedAt: at(20) },
      { fact: 'concluded repeatedly', reinforcedCount: 5, lastReinforcedAt: at(1) },
    ];
    expect(rankDeclaredFacts(facts)[0]!.fact).toBe('concluded repeatedly');
  });

  it('breaks ties on recency', () => {
    const facts: DeclaredFact[] = [
      { fact: 'older', reinforcedCount: 2, lastReinforcedAt: at(1) },
      { fact: 'newer', reinforcedCount: 2, lastReinforcedAt: at(20) },
    ];
    expect(rankDeclaredFacts(facts)[0]!.fact).toBe('newer');
  });

  it('does not mutate the caller array', () => {
    const facts: DeclaredFact[] = [
      { fact: 'a', reinforcedCount: 1, lastReinforcedAt: at(1) },
      { fact: 'b', reinforcedCount: 9, lastReinforcedAt: at(1) },
    ];
    rankDeclaredFacts(facts);
    expect(facts[0]!.fact).toBe('a');
  });
});

describe('renderProfileBlock', () => {
  const emptyProfile = compileConversationProfile([], 'UTC');

  it('costs nothing when there is nothing credible to say', () => {
    expect(renderProfileBlock(emptyProfile, [])).toBe('');
  });

  it('keeps observed traits and declared facts under separate headings', () => {
    const profile = compileConversationProfile(many(10, () => msg('still awake', 23)), 'UTC');
    const block = renderProfileBlock(profile, [
      { fact: 'Prefers evening workouts.', reinforcedCount: 2, lastReinforcedAt: new Date() },
    ]);

    expect(block).toContain('Observed from this thread');
    expect(block).toContain('What they have actually told you');
    // The distinction is load-bearing: a counted pattern must not be
    // presented as something the person said.
    expect(block).toContain('do not state these back as if they had');
  });

  it('shows the count behind an observed trait, not a bare claim', () => {
    const profile = compileConversationProfile(many(10, () => msg('still awake', 23)), 'UTC');
    expect(renderProfileBlock(profile, [])).toContain('10 of 10 messages');
  });

  it('adapts the length instruction to how the person actually writes', () => {
    const terse = compileConversationProfile(many(10, () => msg('yep', 12)), 'UTC');
    // Genuinely multi-sentence (>80 chars). A single medium sentence
    // is 'brief', not 'standard' — the bands are fragments / one
    // sentence / more than one, and that distinction is the point.
    const wordy = compileConversationProfile(
      many(10, () =>
        msg(
          'I wanted to ask you something about how my week has been going overall. It feels like my sleep has been worse since Tuesday and I am not sure why.',
          12,
        ),
      ),
      'UTC',
    );

    expect(renderProfileBlock(terse, [])).toContain('one short sentence');
    expect(renderProfileBlock(wordy, [])).toContain('four short sentences');
  });

  it('drops whole facts at the budget rather than truncating one mid-sentence', () => {
    const facts: DeclaredFact[] = Array.from({ length: 40 }, (_, i) => ({
      fact: `Fact number ${i} which is reasonably long so the budget actually bites here.`,
      reinforcedCount: 40 - i,
      lastReinforcedAt: new Date(),
    }));
    const block = renderProfileBlock(emptyProfile, facts, 400);

    expect(block.length).toBeLessThan(600);
    // Highest-reinforced survives; nothing is cut mid-fact.
    expect(block).toContain('Fact number 0');
    for (const line of block.split('\n').filter((l) => l.startsWith('- Fact'))) {
      expect(line.endsWith('here.')).toBe(true);
    }
  });
});
