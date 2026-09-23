import { describe, it, expect } from 'vitest';
import { buildAdaptationPlan } from './musicAdaptation.js';

describe('buildAdaptationPlan — the iso principle', () => {
  it('opens near the current heart rate rather than at the target', () => {
    // The whole point: music far from someone's current arousal tends to
    // be skipped rather than followed, so the plan meets them first.
    const plan = buildAdaptationPlan({ heartRate: 88, stress: 70, goal: 'calm', minutes: 20 });
    expect(plan.openingBpm).toBeGreaterThanOrEqual(80);
    expect(plan.targetBpm).toBeLessThan(plan.openingBpm);
    expect(plan.anchoredToHeartRate).toBe(true);
  });

  it('will not let a racing heart rate drag the calm opening up without limit', () => {
    // Matching a 130bpm panic with 130bpm music is the literal opposite
    // of the intent. "Meet them where they are" must never override
    // "and then go somewhere better".
    const plan = buildAdaptationPlan({ heartRate: 130, goal: 'calm', minutes: 20 });
    expect(plan.openingBpm).toBeLessThanOrEqual(95);
  });

  it('ramps downward for calm and upward for energize', () => {
    const calm = buildAdaptationPlan({ heartRate: 85, goal: 'calm', minutes: 20 });
    const energize = buildAdaptationPlan({ heartRate: 70, goal: 'energize', minutes: 30 });
    expect(calm.steps.at(-1)!.bpm).toBeLessThan(calm.steps[0]!.bpm);
    expect(energize.steps.at(-1)!.bpm).toBeGreaterThan(energize.steps[0]!.bpm);
  });

  it('lands the energize ramp inside the researched training band', () => {
    // 120-140 BPM is where the endurance evidence sits; the ramp must
    // actually arrive there rather than near it.
    const plan = buildAdaptationPlan({ heartRate: 72, goal: 'energize', minutes: 30 });
    expect(plan.targetBpm).toBeGreaterThanOrEqual(120);
    expect(plan.targetBpm).toBeLessThanOrEqual(140);
  });

  it('lands the calm ramp inside the researched arousal-reduction band', () => {
    const plan = buildAdaptationPlan({ heartRate: 90, goal: 'calm', minutes: 20 });
    expect(plan.targetBpm).toBeGreaterThanOrEqual(60);
    expect(plan.targetBpm).toBeLessThanOrEqual(80);
  });

  it('says plainly when there was no heart rate to anchor to', () => {
    // Otherwise the UI implies a personalisation that did not happen.
    const plan = buildAdaptationPlan({ heartRate: null, goal: 'calm', minutes: 20 });
    expect(plan.anchoredToHeartRate).toBe(false);
    expect(plan.rationale).toMatch(/no recent heart rate/i);
  });

  it('spreads the ramp across the session length', () => {
    const plan = buildAdaptationPlan({ heartRate: 80, goal: 'calm', minutes: 30 });
    expect(plan.steps[0]!.atMinute).toBe(0);
    expect(plan.steps.at(-1)!.atMinute).toBeLessThan(30);
    const minutes = plan.steps.map((s) => s.atMinute);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });

  it('holds steady for focus rather than inventing a tempo the evidence lacks', () => {
    // Background-music-and-cognition research does not converge on a
    // focus tempo, so this must not manufacture a dramatic ramp.
    const plan = buildAdaptationPlan({ heartRate: 78, goal: 'focus', minutes: 45 });
    expect(Math.abs(plan.targetBpm - plan.openingBpm)).toBeLessThanOrEqual(20);
  });

  it('notes elevated stress in the rationale without promising an outcome', () => {
    const plan = buildAdaptationPlan({ heartRate: 84, stress: 80, goal: 'calm', minutes: 20 });
    expect(plan.rationale).toMatch(/stress score is elevated/i);
    // Never a claim that the music will fix it.
    expect(plan.rationale).not.toMatch(/\b(will (lower|reduce|calm)|guarantee|cures?)\b/i);
  });

  it('explains itself in every case — a plan with no reason is just an ad', () => {
    for (const goal of ['calm', 'focus', 'energize'] as const) {
      const plan = buildAdaptationPlan({ heartRate: 75, goal, minutes: 20 });
      expect(plan.rationale.length).toBeGreaterThan(60);
      expect(plan.steps).toHaveLength(3);
    }
  });
});
