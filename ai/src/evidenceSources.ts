/**
 * The evidence register for MoodSync's health reasoning.
 *
 * Every threshold this app applies to someone's body should be
 * traceable to something a person can go and read. This file is where
 * that trace lives, and it has one rule that matters more than the
 * others: `supports` says what the source *actually establishes*, not
 * what would be convenient for the feature citing it.
 *
 * That distinction is the whole point. It is easy to cite the WHO
 * physical-activity guidelines next to a recovery recommendation and
 * imply the WHO endorses the recommendation; they do not. They
 * establish a weekly activity target, and MoodSync's use of that target
 * as context is MoodSync's own inference. Where a claim is ours rather
 * than a source's, `limits` says so.
 *
 * Nothing in here may be invented. A citation that cannot be opened and
 * checked is worse than no citation, because it borrows authority it
 * has not earned.
 */

export type EvidenceTopic =
  | 'sleep-duration'
  | 'physical-activity'
  | 'hrv'
  | 'resting-heart-rate'
  | 'wearable-accuracy'
  | 'max-heart-rate'
  | 'body-composition';

export interface EvidenceSource {
  id: string;
  /** Title as published. */
  title: string;
  organization: string;
  url: string;
  topic: EvidenceTopic;
  /** ISO date this entry was verified against the live source. */
  accessed: string;
  /** What the source genuinely establishes. Written to be shown. */
  supports: string;
  /** What it does NOT establish, where a reader might assume otherwise.
   * Null only when there is no plausible over-reading. */
  limits: string | null;
}

export const EVIDENCE_SOURCES: EvidenceSource[] = [
  {
    id: 'aasm-teen-sleep',
    title: 'Teen Sleep Duration Health Advisory',
    organization: 'American Academy of Sleep Medicine',
    url: 'https://aasm.org/advocacy/position-statements/teen-sleep-duration-health-advisory/',
    topic: 'sleep-duration',
    accessed: '2026-09-23',
    supports:
      'Teenagers aged 13–18 should sleep 8 to 10 hours per 24 hours on a regular basis for optimal health and daytime alertness.',
    limits:
      'An age-band recommendation for a population. It does not establish that any individual night below the band causes harm, and MoodSync does not treat it that way.',
  },
  {
    id: 'cdc-sleep',
    title: 'About Sleep',
    organization: 'U.S. Centers for Disease Control and Prevention',
    url: 'https://www.cdc.gov/sleep/about/index.html',
    topic: 'sleep-duration',
    accessed: '2026-09-23',
    supports: 'Recommended sleep duration by age group for adults and children.',
    limits: 'Duration guidance only. It does not prescribe how to respond to a single short night.',
  },
  {
    id: 'odphp-pag',
    title: 'Physical Activity Guidelines for Americans',
    organization: 'U.S. Office of Disease Prevention and Health Promotion',
    url: 'https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines',
    topic: 'physical-activity',
    accessed: '2026-09-23',
    supports: 'Weekly aerobic and strengthening activity targets for adults and for children and adolescents.',
    limits:
      'A weekly target, not a daily one, and not a recovery model. Using recent activity as recovery context is MoodSync’s own inference, not a claim of these guidelines.',
  },
  {
    id: 'who-pa',
    title: 'WHO guidelines on physical activity and sedentary behaviour',
    organization: 'World Health Organization',
    url: 'https://www.who.int/publications/i/item/9789240014886',
    topic: 'physical-activity',
    accessed: '2026-09-23',
    supports: 'Population-level physical activity and sedentary-behaviour recommendations across age groups.',
    limits: 'Population guidance. It says nothing about whether one person should train on one given day.',
  },
  {
    id: 'hrv-wearable-review',
    title: 'Can Wearable Devices Accurately Measure Heart Rate Variability? A Systematic Review',
    organization: 'Annals of Noninvasive Electrocardiology (PubMed 29668452)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29668452/',
    topic: 'wearable-accuracy',
    accessed: '2026-09-23',
    supports:
      'Wearable HRV measurement has been validated with varying accuracy, and reliability outside controlled laboratory conditions is far less established than within them.',
    limits:
      'It does not establish that any particular consumer device is accurate for any particular user. This is why MoodSync compares each person against their own readings rather than against population cut-offs.',
  },
  {
    id: 'ppg-vs-ecg-meta',
    title:
      'Accuracy of Photoplethysmography-Derived Pulse Rate Variability Compared with Electrocardiography-Derived Heart Rate Variability: A Systematic Review and Meta-Analysis',
    organization: 'PMC (PMC13517957)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13517957/',
    topic: 'wearable-accuracy',
    accessed: '2026-09-23',
    supports:
      'Wrist PPG agrees well with ECG for some HRV metrics and less well for others, with short-term variability and high-frequency components the weakest. PPG is additionally susceptible to motion artefact, skin contact and ambient light.',
    limits:
      'Agreement varies by metric and by condition. A wearable HRV number is not an ECG measurement and MoodSync must not present it as one.',
  },
  {
    id: 'tanaka-max-hr',
    title: 'Age-predicted maximal heart rate revisited',
    organization: 'Journal of the American College of Cardiology (Tanaka, Monahan & Seals, 2001)',
    url: 'https://www.jacc.org/doi/10.1016/S0735-1097(00)01054-8',
    topic: 'max-heart-rate',
    accessed: '2026-09-25',
    supports:
      'Meta-analysis of 351 studies and 18,712 subjects deriving maximum heart rate ≈ 208 − 0.7 × age, more accurate than 220 − age, particularly past 40.',
    limits:
      'A population regression. Individuals scatter roughly ±10–12 bpm around it, so zones derived from it are estimates — which is why a measured peak overrides it.',
  },
  {
    id: 'cdc-bmi',
    title: 'About Body Mass Index (BMI)',
    organization: 'U.S. Centers for Disease Control and Prevention',
    url: 'https://www.cdc.gov/bmi/about/index.html',
    topic: 'body-composition',
    accessed: '2026-09-25',
    supports:
      'BMI is a screening measure of weight relative to height. Adults 20 and older are read against weight-status categories; ages 2–19 against age-and-sex growth percentiles.',
    limits:
      'Not diagnostic. It does not distinguish fat, muscle and bone, or indicate fat type or location — and adult categories must not be applied to anyone under 20.',
  },
];

export function sourcesFor(topic: EvidenceTopic): EvidenceSource[] {
  return EVIDENCE_SOURCES.filter((s) => s.topic === topic);
}

export function sourceById(id: string): EvidenceSource | undefined {
  return EVIDENCE_SOURCES.find((s) => s.id === id);
}
