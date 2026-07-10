import type { ScentProfile } from '../types/domain';

/**
 * Every entry here is grounded in RESEARCH.md — do not add an oil or an
 * effect claim without a corresponding citation there. `primaryEffects`
 * drives which wellness states the recommender will actually surface this
 * scent for; an oil with thin evidence for a given state is deliberately
 * left out of that state's `primaryEffects` even if folk tradition claims
 * it (see eucalyptus below).
 */
export const scentLibrary: ScentProfile[] = [
  {
    id: 'lavender',
    name: 'Lavender',
    latinName: 'Lavandula angustifolia',
    family: 'Floral',
    description:
      'The most-studied calming scent in aromatherapy research. Consistently associated with reduced self-reported anxiety and improved sleep quality, though effects on physiological markers like cortisol are inconsistent.',
    primaryEffects: ['relax', 'sleep'],
    evidence: [
      {
        effect: 'Anxiety reduction',
        confidence: 'moderate',
        summary:
          'Meta-analyses across preoperative, dental, and psychiatric settings found significantly lower self-rated anxiety with inhaled lavender versus control. Physiological markers (cortisol, heart rate) were inconsistent.',
        citation: 'Donelli et al. 2019, Phytomedicine (PubMed 31743795); meta-analysis of 11 studies, 972 participants',
        relatedStates: ['relax'],
      },
      {
        effect: 'Sleep quality',
        confidence: 'moderate',
        summary:
          'A pooled analysis of 11 RCTs (628 adults) found a significant improvement in sleep quality, though the authors flagged moderate risk of bias across the included studies.',
        citation: 'Systematic review and meta-analysis, Holistic Nursing Practice (PubMed 40600743)',
        relatedStates: ['sleep'],
      },
      {
        effect: 'Focus / alertness',
        confidence: 'moderate',
        summary:
          'Lavender measurably impaired working memory and slowed reaction time versus control in a controlled trial — the opposite of a focus aid. Not recommended for focus use cases.',
        citation: 'Moss et al. 2003, International Journal of Neuroscience 113:15-38',
        relatedStates: [],
      },
    ],
    bestTimeOfDay: ['Evening', 'Before sleep'],
    compatibleBlends: ['Chamomile', 'Bergamot', 'Sandalwood'],
    safetyNotes: [
      'Generally well tolerated. Diffuser vapor exposure has been associated with essential-oil sensitivity in cats — ventilate the room and provide an escape route for pets.',
    ],
  },
  {
    id: 'rosemary',
    name: 'Rosemary',
    latinName: 'Rosmarinus officinalis',
    family: 'Herbaceous',
    description:
      'Associated with improved memory quality and subjective alertness in controlled trials, alongside a speed/accuracy tradeoff in memory retrieval — a real but modest effect, not a dramatic cognitive boost.',
    primaryEffects: ['focus'],
    evidence: [
      {
        effect: 'Memory and alertness',
        confidence: 'low',
        summary:
          'Improved overall memory quality and subjective alertness versus control and versus lavender in the same trial, but also slowed memory retrieval speed — a tradeoff, not a clean enhancement. This finding comes from essentially one frequently-cited inhalation trial.',
        citation: 'Moss et al. 2003, International Journal of Neuroscience 113:15-38',
        relatedStates: ['focus'],
      },
    ],
    bestTimeOfDay: ['Morning', 'Midday'],
    compatibleBlends: ['Peppermint', 'Lemon'],
    safetyNotes: ['Avoid high concentrations in enclosed spaces for those with epilepsy; consult a doctor if pregnant.'],
  },
  {
    id: 'peppermint',
    name: 'Peppermint',
    latinName: 'Mentha piperita',
    family: 'Minty',
    description:
      'The best-supported scent for subjective alertness in this review, with a clear dose-response relationship in controlled trials. Effects on objective cognitive task performance are weaker and less consistent.',
    primaryEffects: ['energize', 'focus'],
    evidence: [
      {
        effect: 'Alertness',
        confidence: 'moderate',
        summary:
          'Double-blind, placebo-controlled trials found higher-dose peppermint aroma increased subjective alertness and improved performance on some cognitive tasks; a lower dose in the same design showed no effect.',
        citation: 'Moss et al. 2008, International Journal of Neuroscience (PubMed 18041606), 144 participants',
        relatedStates: ['energize', 'focus'],
      },
      {
        effect: 'Cognitive task performance',
        confidence: 'low',
        summary: 'Effects are dose-sensitive and inconsistent across specific task types, typically in small samples.',
        citation: 'Multiple small dose-response trials, various',
        relatedStates: ['focus'],
      },
    ],
    bestTimeOfDay: ['Morning', 'Afternoon slump'],
    compatibleBlends: ['Rosemary', 'Sweet Orange'],
    safetyNotes: [
      'Avoid direct application near infants’ faces (menthol can affect breathing). Peppermint is listed as a concern for cats in diffuser form.',
    ],
  },
  {
    id: 'sweet-orange',
    name: 'Sweet Orange',
    latinName: 'Citrus sinensis',
    family: 'Citrus',
    description:
      'Small studies found mood and anxiety benefits in real clinical waiting rooms, but a larger, more rigorous replication across three dental clinics found no effect — a meaningful caution against overclaiming.',
    primaryEffects: ['relax'],
    evidence: [
      {
        effect: 'Mood and anxiety',
        confidence: 'low',
        summary:
          'An early dental-waiting-room study found reduced anxiety and improved mood, but only in women, not men. A larger replication across three clinics (219 patients) found no significant effect — a genuine null result.',
        citation: 'Lehrner et al. 2000, Physiology & Behavior (PubMed 11134689); Toet et al. replication, three-clinic sample',
        relatedStates: ['relax'],
      },
    ],
    bestTimeOfDay: ['Daytime'],
    compatibleBlends: ['Peppermint', 'Bergamot'],
    safetyNotes: [
      'Cold-pressed citrus oils can cause phototoxic skin reactions if applied topically before sun exposure — not relevant for diffuser-only use. Citrus/limonene is a known concern for cats.',
    ],
  },
  {
    id: 'bergamot',
    name: 'Bergamot',
    latinName: 'Citrus bergamia',
    family: 'Citrus',
    description:
      'Small crossover trials suggest a mood and parasympathetic-activity shift, but even researchers in the field describe the evidence with hedged, non-definitive language.',
    primaryEffects: ['relax'],
    evidence: [
      {
        effect: 'Mood and stress',
        confidence: 'low',
        summary:
          'A crossover RCT in 41 healthy women found a shift in mood state and parasympathetic activity. A broader review of 31 studies concluded bergamot "could be" useful for stress reduction, without a large confirmatory trial.',
        citation: 'Watanabe et al., PubMed 25824404; broader review of 20 human studies (1,709 subjects) and 11 animal studies',
        relatedStates: ['relax'],
      },
    ],
    bestTimeOfDay: ['Evening'],
    compatibleBlends: ['Lavender', 'Sweet Orange'],
    safetyNotes: ['Phototoxic if applied topically before sun exposure — diffuser use only avoids this risk.'],
  },
  {
    id: 'lemon',
    name: 'Lemon',
    latinName: 'Citrus limon',
    family: 'Citrus',
    description:
      'Widely marketed as energizing, but the human evidence is thin — most supporting data comes from rodent studies, not people. A frequently cited "54% fewer errors" workplace statistic is industry-reported, not from a controlled trial, and is not used here.',
    primaryEffects: [],
    evidence: [
      {
        effect: 'Mood / energy (human)',
        confidence: 'insufficient',
        summary:
          'Antidepressant-like effects and serotonin/dopamine modulation are documented in rodent forced-swim-test studies, but rigorous human inhalation trials are lacking.',
        citation: 'Komori et al. 1995, European Neuropsychopharmacology (rodent study)',
        relatedStates: [],
      },
    ],
    bestTimeOfDay: ['Daytime'],
    compatibleBlends: ['Rosemary', 'Peppermint'],
    safetyNotes: ['Phototoxic if applied topically before sun exposure. Citrus/limonene is a known concern for cats.'],
  },
  {
    id: 'ylang-ylang',
    name: 'Ylang Ylang',
    latinName: 'Cananga odorata',
    family: 'Floral',
    description:
      'Small trials from a single research group found reduced blood pressure and heart rate alongside self-reported calm — but the same data also showed an odd increase in subjective alertness, an inconsistency worth noting.',
    primaryEffects: ['recover'],
    evidence: [
      {
        effect: 'Relaxation (blood pressure / heart rate)',
        confidence: 'low',
        summary:
          'Inhalation and transdermal application reduced blood pressure and heart rate with self-reported calm in small trials (~20-30 healthy adults each), with limited independent replication beyond one research group.',
        citation: 'Hongratanaworakit & Buchbauer, PubMed 24278868 and 16807875',
        relatedStates: ['recover'],
      },
    ],
    bestTimeOfDay: ['Evening'],
    compatibleBlends: ['Sandalwood', 'Bergamot'],
    safetyNotes: ['Listed as a concern for cats in diffuser form. Can cause headaches in high concentrations for some people.'],
  },
  {
    id: 'chamomile',
    name: 'Roman Chamomile',
    latinName: 'Chamaemelum nobile',
    family: 'Floral / Herbaceous',
    description:
      'Traditional sleep and anxiety aid with some small-trial support, but the field’s own systematic reviewers flag high risk of bias in the underlying studies.',
    primaryEffects: ['sleep', 'relax'],
    evidence: [
      {
        effect: 'Sleep and anxiety',
        confidence: 'low',
        summary:
          'Small RCTs report reduced insomnia severity and lower anxiety in inpatient settings, but a broader systematic review of herbal sedatives explicitly notes methodological weaknesses and high risk of bias across this literature.',
        citation: 'Small inhalation RCTs; systematic review of herbal sedatives (methodology caveat explicit in source)',
        relatedStates: ['sleep', 'relax'],
      },
    ],
    bestTimeOfDay: ['Evening', 'Before sleep'],
    compatibleBlends: ['Lavender'],
    safetyNotes: ['Those with ragweed allergies (same plant family) should use caution.'],
  },
  {
    id: 'sandalwood',
    name: 'Sandalwood',
    latinName: 'Santalum spicatum',
    family: 'Woody',
    description:
      'A single small pilot study found physiological signs of relaxation. Real measurements, but not yet replicated — treat as a promising early signal rather than an established effect.',
    primaryEffects: ['recover'],
    evidence: [
      {
        effect: 'Relaxation (blood pressure, cortisol)',
        confidence: 'low',
        summary:
          'A pilot study found reduced systolic blood pressure and salivary cortisol during a designated "recreation phase" with Western Australian sandalwood oil. Single small study, not yet replicated.',
        citation: 'Pilot study, PubMed 30549622',
        relatedStates: ['recover'],
      },
    ],
    bestTimeOfDay: ['Evening'],
    compatibleBlends: ['Ylang Ylang', 'Lavender'],
    safetyNotes: ['Generally well tolerated in diffuser form.'],
  },
  {
    id: 'frankincense',
    name: 'Frankincense',
    latinName: 'Boswellia sacra',
    family: 'Resinous',
    description:
      'Popular in wellness marketing for grounding and recovery, but the human evidence base is currently too thin to make a specific claim — most support comes from animal studies.',
    primaryEffects: [],
    evidence: [
      {
        effect: 'Relaxation / anxiety',
        confidence: 'insufficient',
        summary:
          'Most supporting evidence comes from animal studies (rat models of stress-induced depression). A frequently cited human trial could not be verified against a specific indexed journal and is not relied on here.',
        citation: 'Animal studies only verifiable at time of review; human RCT citation unverifiable',
        relatedStates: [],
      },
    ],
    bestTimeOfDay: ['Evening'],
    compatibleBlends: ['Sandalwood'],
    safetyNotes: ['Generally well tolerated in diffuser form.'],
  },
  {
    id: 'eucalyptus',
    name: 'Eucalyptus',
    latinName: 'Eucalyptus globulus',
    family: 'Camphoraceous',
    description:
      'Well documented for respiratory and antimicrobial use, but the common marketing claim that it is "energizing" has no isolated human evidence behind it in this review — it is included here for transparency, not as an active recommendation.',
    primaryEffects: [],
    evidence: [
      {
        effect: 'Alertness / energizing',
        confidence: 'insufficient',
        summary:
          'No isolated human RCT evidence was found for an alertness or energizing effect specifically. The claim appears to be a marketing extrapolation from eucalyptus sharing the 1,8-cineole compound with rosemary, which does have supporting data of its own.',
        citation: 'No qualifying human RCT found at time of review',
        relatedStates: [],
      },
    ],
    bestTimeOfDay: [],
    compatibleBlends: [],
    safetyNotes: [
      'Contraindicated for infants and young children (risk of laryngospasm). Can trigger irritation in those with asthma or fragrance sensitivity. Listed as a concern for cats in diffuser form.',
    ],
  },
];

export function getScentById(id: string): ScentProfile | undefined {
  return scentLibrary.find((scent) => scent.id === id);
}

export function getScentsForState(state: ScentProfile['primaryEffects'][number]): ScentProfile[] {
  return scentLibrary.filter((scent) => scent.primaryEffects.includes(state));
}
