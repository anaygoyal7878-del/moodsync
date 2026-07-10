import type { BiometricSample, ContributingFactor, WellnessAssessment, WellnessStateId } from '../types/domain';
import { CONFIDENCE_TEMPERATURE, CONTRIBUTING_FACTOR_THRESHOLD, wellnessEngineConfig } from './config';
import { deriveFeatures, describeMetric, metricLabels } from './features';

const ALL_STATES: WellnessStateId[] = ['relax', 'focus', 'sleep', 'energize', 'recover', 'meditate'];

function weightedScore(profile: (typeof wellnessEngineConfig)[number], features: Partial<Record<string, number>>): number {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const { metric, weight, curve } of profile.metricWeights) {
    const value = features[metric];
    if (value === undefined) continue;
    weightedSum += weight * curve.score(value);
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0.5; // neutral prior with zero signal
  return weightedSum / weightTotal;
}

function softmax(scores: Record<WellnessStateId, number>, temperature: number): Record<WellnessStateId, number> {
  const t = Math.max(temperature, 0.01);
  const exponentiated = ALL_STATES.map((state) => Math.exp(scores[state] / t));
  const sum = exponentiated.reduce((a, b) => a + b, 0);

  const result = {} as Record<WellnessStateId, number>;
  ALL_STATES.forEach((state, i) => {
    result[state] = sum > 0 ? exponentiated[i] / sum : 1 / ALL_STATES.length;
  });
  return result;
}

/**
 * Combines the latest biometric sample into a weighted score per wellness
 * state, then a softmax over those scores for a calibrated confidence
 * distribution. There's no branching if/else state logic — every state's
 * sensitivity to every metric lives in `config.ts` as data.
 */
export function assessWellness(sample: BiometricSample): WellnessAssessment {
  const features = deriveFeatures(sample);

  const rawScores = {} as Record<WellnessStateId, number>;
  for (const profile of wellnessEngineConfig) {
    rawScores[profile.state] = weightedScore(profile, features);
  }

  const probabilities = softmax(rawScores, CONFIDENCE_TEMPERATURE);
  const winner = ALL_STATES.reduce((best, state) => (probabilities[state] > probabilities[best] ? state : best), ALL_STATES[0]);

  const winningProfile = wellnessEngineConfig.find((p) => p.state === winner)!;
  const contributingFactors: ContributingFactor[] = winningProfile.metricWeights
    .filter(({ metric, weight }) => weight >= CONTRIBUTING_FACTOR_THRESHOLD && features[metric] !== undefined)
    .sort((a, b) => b.weight - a.weight)
    .map(({ metric, weight }) => ({
      metric: metricLabels[metric],
      description: describeMetric(metric, features[metric]!, sample),
      weight,
    }));

  return {
    state: winner,
    confidence: probabilities[winner],
    contributingFactors,
    timestamp: sample.timestamp,
    componentScores: rawScores,
  };
}
