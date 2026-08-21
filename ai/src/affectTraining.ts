import type { NormalizedBiometricReading } from '@moodsync/shared';
import { extractFeatures, readingForMoment, usableFeatures, featureLabel } from './affectFeatures.js';
import {
  learnAffectModel,
  describeAssociation,
  MIN_SAMPLES_TO_LEARN,
  type AffectModel,
  type AffectTarget,
  type LabeledSample,
} from './affectModel.js';

/**
 * Assembles a person's labelled dataset and fits both circumplex axes.
 *
 * Pure: takes check-ins and readings, returns models. The database work
 * lives in the backend service, so the whole learning path can be
 * tested against constructed data rather than a live account.
 */

export interface CheckInRecord {
  valence: number;
  arousal: number;
  createdAt: Date;
}

export interface AffectLearning {
  /** How many check-ins exist, before any were discarded for lacking a
   * nearby reading. Reported separately from `usableSamples` so
   * "you've checked in 30 times but only 8 had a reading near them" is
   * visible — that's a sync problem, not a lack of effort, and the two
   * need different advice. */
  totalCheckIns: number;
  usableSamples: number;
  features: string[];
  valence: AffectModel;
  arousal: AffectModel;
  /** Sentences safe to show, drawn only from models that cleared their
   * floors. Empty is a normal and frequent outcome. */
  findings: string[];
}

/**
 * Pairs each check-in with the reading that preceded it, dropping
 * check-ins that have none.
 *
 * The history handed to the feature extractor is strictly the readings
 * before that check-in, so a baseline is never shaped by data from
 * after the moment it describes.
 */
export function buildSamples(
  checkIns: CheckInRecord[],
  readings: NormalizedBiometricReading[],
): LabeledSample[] {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const samples: LabeledSample[] = [];
  for (const checkIn of checkIns) {
    const reading = readingForMoment(sorted, checkIn.createdAt);
    if (!reading) continue;

    const history = sorted.filter((r) => new Date(r.timestamp).getTime() < checkIn.createdAt.getTime());
    const features = extractFeatures(reading, history);
    if (Object.keys(features).length === 0) continue;

    samples.push({ features, valence: checkIn.valence, arousal: checkIn.arousal });
  }
  return samples;
}

/**
 * The top association from a usable model, as a sentence.
 *
 * Only the strongest is surfaced. Listing every coefficient invites
 * reading a ranking into what is mostly noise at these sample sizes,
 * and the second-strongest feature in a 4-feature model fit on 25
 * points is not a finding.
 */
function findingFor(model: AffectModel): string | null {
  if (!model.usable) return null;
  const top = model.associations[0];
  if (!top) return null;
  return describeAssociation(top, model.target, featureLabel(top.feature), model.sampleSize);
}

export function learnAffect(
  checkIns: CheckInRecord[],
  readings: NormalizedBiometricReading[],
): AffectLearning {
  const samples = buildSamples(checkIns, readings);
  const features = usableFeatures(samples);

  const valence = learnAffectModel(samples, features, 'valence');
  const arousal = learnAffectModel(samples, features, 'arousal');

  const findings = [findingFor(valence), findingFor(arousal)].filter((f): f is string => f !== null);

  return {
    totalCheckIns: checkIns.length,
    usableSamples: samples.length,
    features,
    valence,
    arousal,
    findings,
  };
}

/**
 * What to tell someone who has no usable model yet, and why.
 *
 * The distinction matters more than it looks: "keep checking in" and
 * "your watch isn't syncing" and "we looked and found nothing" are
 * three different situations, and only the first is solved by waiting.
 * The third is a real result and is said plainly rather than dressed up
 * as progress.
 */
export function learningStatus(learning: AffectLearning): string {
  if (learning.totalCheckIns < MIN_SAMPLES_TO_LEARN) {
    const remaining = MIN_SAMPLES_TO_LEARN - learning.totalCheckIns;
    return `${remaining} more check-in${remaining === 1 ? '' : 's'} before MoodSync can look for a pattern.`;
  }
  if (learning.usableSamples < MIN_SAMPLES_TO_LEARN) {
    return `You've checked in ${learning.totalCheckIns} times, but only ${learning.usableSamples} had a wearable reading close enough to use. That's a sync gap, not a check-in problem.`;
  }
  if (learning.features.length === 0) {
    return 'Your wearable isn’t reporting any metric consistently enough to learn from yet.';
  }
  if (learning.findings.length === 0) {
    return `MoodSync looked across ${learning.usableSamples} check-ins and couldn’t predict how you feel from your biometrics better than guessing your average. That’s a real result — for plenty of people, day-to-day mood just isn’t visible in this data.`;
  }
  return `Learned from ${learning.usableSamples} check-ins.`;
}

export type { AffectModel, AffectTarget, LabeledSample };
