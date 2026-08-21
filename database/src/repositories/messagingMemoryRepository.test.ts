import { describe, expect, it } from 'vitest';
import { normalizeFact } from './messagingMemoryRepository.js';

/**
 * `normalizeFact` decides whether a re-saved fact reinforces an existing
 * memory or creates a second near-duplicate row. Getting it wrong in one
 * direction wastes prompt budget on repeats; in the other it silently
 * merges two genuinely different memories into one. It also has to stay
 * byte-identical to the SQL backfill in
 * migrations/20260820160000_messaging_fact_reinforcement.
 */
describe('normalizeFact', () => {
  it('treats casing and trailing punctuation as the same claim', () => {
    expect(normalizeFact('Prefers evening workouts.')).toBe(normalizeFact('prefers evening workouts'));
  });

  it('collapses incidental whitespace', () => {
    expect(normalizeFact('  trains   in the\tmorning ')).toBe('trains in the morning');
  });

  it('keeps genuinely different claims apart', () => {
    expect(normalizeFact('Prefers evening workouts.')).not.toBe(normalizeFact('Prefers morning workouts.'));
  });

  it('does not merge on meaning — only on form', () => {
    // Deliberate: deciding these are "the same" is a judgment this
    // layer has no business making, and a wrong merge destroys a real
    // memory silently.
    expect(normalizeFact('Prefers evening workouts.')).not.toBe(normalizeFact('Likes training after work.'));
  });

  it('preserves digits, which often carry the whole meaning', () => {
    expect(normalizeFact('Targets 8 hours of sleep.')).toBe('targets 8 hours of sleep');
  });

  it('reduces a punctuation-only string to empty, so it can be rejected', () => {
    expect(normalizeFact('!!! ...')).toBe('');
  });
});
