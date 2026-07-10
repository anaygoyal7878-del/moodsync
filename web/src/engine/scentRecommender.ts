import { getScentsForState } from '../data/scentLibrary';
import type { ConfidenceLevel, ScentProfile, ScentRecommendation, WellnessAssessment } from '../types/domain';

const confidenceRank: Record<ConfidenceLevel, number> = {
  high: 3,
  moderate: 2,
  low: 1,
  insufficient: 0,
};

function currentTimeBucket(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Daytime';
  if (hour < 21) return 'Evening';
  return 'Before sleep';
}

/**
 * Per the editorial rules in RESEARCH.md: never say "studies show" for a
 * low/insufficient rated claim, and never phrase anything as a medical or
 * treatment claim.
 */
function hedgeForConfidence(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high':
      return 'Multiple studies consistently support this';
    case 'moderate':
      return 'Several studies support this, though replication is limited';
    case 'low':
      return 'Early, small-scale research suggests this — treat as a promising signal, not a settled finding';
    case 'insufficient':
      return 'Evidence for this is currently too thin to draw a conclusion — included here for transparency, not as a strong claim';
  }
}

function bestEvidenceFor(scent: ScentProfile, stateId: ScentRecommendation['wellnessState']) {
  const matches = scent.evidence.filter((entry) => entry.relatedStates.includes(stateId));
  if (matches.length === 0) return scent.evidence[0];
  return matches.reduce((best, entry) => (confidenceRank[entry.confidence] > confidenceRank[best.confidence] ? entry : best));
}

/**
 * Chooses the best-evidenced scent for an assessed wellness state and
 * builds a fully traceable explanation: the biometric factors that drove
 * the assessment, plus the specific citation backing the scent choice.
 */
export function recommendScent(assessment: WellnessAssessment, now: Date = new Date()): ScentRecommendation | null {
  let candidates = getScentsForState(assessment.state);
  let isFallback = false;

  // Meditation currently has no essential oil directly studied for
  // meditation support in our evidence review (see RESEARCH.md) — rather
  // than fabricate a claim, fall back to the calming/relax options and
  // say so explicitly.
  if (candidates.length === 0) {
    candidates = getScentsForState('relax');
    isFallback = true;
  }
  if (candidates.length === 0) return null;

  const effectiveState = isFallback ? 'relax' : assessment.state;
  const timeBucket = currentTimeBucket(now);

  const ranked = candidates
    .map((scent) => ({ scent, evidence: bestEvidenceFor(scent, effectiveState) }))
    .sort((a, b) => {
      const confidenceDelta = confidenceRank[b.evidence.confidence] - confidenceRank[a.evidence.confidence];
      if (confidenceDelta !== 0) return confidenceDelta;
      const aTimeMatch = a.scent.bestTimeOfDay.includes(timeBucket) ? 1 : 0;
      const bTimeMatch = b.scent.bestTimeOfDay.includes(timeBucket) ? 1 : 0;
      return bTimeMatch - aTimeMatch;
    });

  const top = ranked[0];

  const explanation = [
    ...assessment.contributingFactors.map((factor) => factor.description),
    isFallback
      ? `No essential oil in our evidence review has been directly studied for meditation support, so this is a calming option often paired with mindfulness practice, not a direct match.`
      : `${hedgeForConfidence(top.evidence.confidence)}: ${top.evidence.summary}`,
    `Source: ${top.evidence.citation}`,
  ];

  return {
    scent: top.scent,
    wellnessState: assessment.state,
    confidence: isFallback ? 'insufficient' : top.evidence.confidence,
    explanation,
    timestamp: assessment.timestamp,
    isFallback,
  };
}
