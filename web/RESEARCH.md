# MoodSync evidence review: essential oils and biometric states

This is the scientific foundation for the scent library and recommendation
engine (`src/data/scentLibrary.ts`, `src/engine/`). It is a synthesis of
published research found via PubMed-indexed systematic reviews,
meta-analyses, and RCTs — not aromatherapy marketing material.

**Methodology and limits.** Aromatherapy research as a field suffers from
small sample sizes, near-impossible blinding (subjects usually know what
they're smelling), heterogeneous outcome measures, and industry-adjacent
publication bias. Every confidence rating below should be read as
provisional. Where a citation could not be independently verified to a
specific indexed source, that is stated explicitly rather than presented
as fact.

**Confidence scale used throughout the app:**
- **HIGH** — multiple RCTs or systematic reviews with consistent positive findings
- **MODERATE** — some positive RCTs, but mixed or limited replication
- **LOW** — mostly small studies, animal studies, or inconsistent/null findings
- **INSUFFICIENT** — essentially no rigorous human evidence; folk claim only

No pairing in this review reaches HIGH. That itself is a finding worth
surfacing in the product rather than hiding.

---

## Lavender (*Lavandula angustifolia*)

**Anxiety reduction — MODERATE.** The best-studied oil/effect pairing in
this review. Donelli et al. 2019 (*Phytomedicine*, PubMed 31743795) and a
separate meta-analysis of 11 studies (972 participants) found inhaled
lavender significantly reduced self-rated anxiety across preoperative,
dental, and psychiatric-waiting-room populations. Physiological markers
(cortisol, heart rate, diastolic blood pressure) were inconsistent; only
systolic BP showed a small significant drop in one meta-analysis. Note:
the strongest RCT evidence for lavender overall is for oral Silexan
capsules (Kasper et al., network meta-analysis, *Scientific Reports*
2019) — a pharmaceutical oral supplement, not ambient diffusion, so it
doesn't transfer directly to a diffuser product.

**Sleep — MODERATE.** A 2024/2025 systematic review and meta-analysis
(*Holistic Nursing Practice*, PubMed 40600743) pooled 11 RCTs (628 adults)
and found a significant effect on sleep quality (SMD = -0.56, 95% CI
[-0.96, -0.17], p = .005), while explicitly flagging moderate risk of bias
across the pooled studies.

**Cognition/alertness — MODERATE, and negative.** Moss et al. 2003
(*International Journal of Neuroscience* 113:15–38, 144 participants)
found lavender *impaired* working memory and slowed reaction times versus
control — consistent with its sedative profile. Lavender should not be
recommended for focus/alertness use cases.

---

## Rosemary (*Rosmarinus officinalis*)

**Memory/alertness — LOW-MODERATE.** The same Moss et al. 2003 study found
rosemary improved overall memory quality and secondary memory factors
versus both control and lavender, plus increased subjective alertness —
but also slowed memory retrieval speed (a speed/accuracy tradeoff, not a
clean enhancement). A follow-up oral-extract RCT in university students
found improved memory scores, but used ingestion, not inhalation — a
different modality that doesn't directly support a diffuser claim.

---

## Peppermint

**Alertness — MODERATE.** Multiple small RCTs show dose-dependent effects:
higher-dose peppermint aroma (100μL vs. an ineffective 50μL dose)
increased subjective alertness and improved performance on some cognitive
tasks in double-blind, placebo-controlled trials. Moss et al. 2008
(*International Journal of Neuroscience*, PubMed 18041606, 144
participants) found peppermint increased alertness.

**Cognitive task performance — LOW.** Effects are dose-sensitive and
inconsistent across specific tasks, with small samples (often n<50).

---

## Citrus oils

**Sweet orange, mood/anxiety — LOW-MODERATE.** Lehrner et al. 2000
(*Physiology & Behavior*, PubMed 11134689) found ambient orange odor
reduced anxiety and improved mood in a real dental waiting room — but only
in women, not men. Critically, a larger, more rigorous replication (Toet
et al., 219 patients across three dental clinics) found **no effect** —
a genuine null result that should temper any orange-scent claim.

**Bergamot, mood/anxiety — LOW-MODERATE.** A crossover RCT (41 healthy
women, Watanabe et al., PubMed 25824404) found bergamot vapor shifted mood
and parasympathetic activity. A separate crossover trial (48 students)
reported improved depression/anxiety/stress scores. A broader review (31
studies) concluded bergamot "could be" useful for stress — hedged language
even from proponents, and no large confirmatory RCT exists.

**Lemon, mood/anxiety — LOW / INSUFFICIENT for humans.** Most supporting
evidence (serotonin/dopamine modulation, antidepressant-like effects in
forced-swim tests) comes from rodent studies (Komori et al. 1995,
*European Neuropsychopharmacology*), not humans. A commonly repeated
"54% fewer workplace errors" statistic traces to non-peer-reviewed
industry reporting, not a controlled trial, and is deliberately **not**
used anywhere in this app.

---

## Ylang ylang

**Relaxation (BP/HR) — LOW.** Two small controlled trials from one
research group (Hongratanaworakit & Buchbauer, PubMed 24278868 and
16807875, ~20–30 healthy adults each) found inhalation and transdermal
application reduced blood pressure and heart rate with self-reported
calm — but one of the same trials also reported *increased* subjective
alertness, an internally inconsistent pattern. Limited independent
replication.

---

## Chamomile

**Anxiety/sleep — LOW-MODERATE.** A small RCT found a 15-day inhalation
protocol reduced insomnia severity in young adults; other small RCTs
report reduced anxiety in cardiac/obstetric inpatients and
pre-endoscopy patients. A broader systematic review of herbal sedatives
(including chamomile) explicitly notes "methodological weaknesses, high
risk of bias, and substantial heterogeneity limit evidence strength."

---

## Sandalwood

**Relaxation — LOW.** A single pilot study ("A Pilot Study on the
Physiological Effects of Three Essential Oils in Humans," PubMed
30549622) found reduced systolic blood pressure and salivary cortisol
during a "recreation phase" with Western Australian sandalwood oil. One
small pilot; not replicated.

---

## Frankincense

**Relaxation/anxiety — INSUFFICIENT to LOW.** Most support comes from
animal studies (rat LPS-induced depression models). A frequently cited
human trial (58 participants) could not be verified to a specific
indexed journal beyond secondary/blog references, so it is **not**
treated as established evidence in this app.

---

## Eucalyptus

**Alertness/energizing — INSUFFICIENT.** No isolated human RCT evidence
was found for alertness or energizing effects specifically — this
appears to be a marketing extrapolation from eucalyptus sharing the
1,8-cineole compound with rosemary. One multi-oil blend RCT
(lemon+eucalyptus+tea tree+peppermint) showed reduced stress and better
sleep, but cannot isolate eucalyptus's individual contribution.
Eucalyptus is **not** presented as an energizing scent in this app; its
established use case (respiratory/antimicrobial) is out of scope for a
wellness-diffuser product.

---

## Summary table

| Oil | Effect | Confidence | Key source |
|---|---|---|---|
| Lavender | Anxiety reduction | MODERATE | Donelli 2019 (PubMed 31743795) |
| Lavender | Sleep | MODERATE | Meta-analysis, 11 RCTs/628 pts (PubMed 40600743) |
| Lavender | Alertness | MODERATE (negative) | Moss et al. 2003, IJN 113:15-38 |
| Rosemary | Memory/alertness | LOW-MODERATE | Moss et al. 2003, IJN 113:15-38 |
| Peppermint | Alertness | MODERATE | Moss et al. 2008 (PubMed 18041606) |
| Peppermint | Cognitive task performance | LOW | Small, dose-dependent, inconsistent |
| Sweet orange | Mood/anxiety | LOW-MODERATE | Lehrner 2000 positive; Toet replication null |
| Bergamot | Mood/anxiety | LOW-MODERATE | Watanabe 2015 (PubMed 25824404) |
| Lemon | Mood/anxiety (human) | LOW/INSUFFICIENT | Mostly rodent (Komori 1995) |
| Ylang ylang | Relaxation (BP/HR) | LOW | Hongratanaworakit & Buchbauer |
| Chamomile | Anxiety/sleep | LOW-MODERATE | Reviewers flag high bias risk |
| Sandalwood | Relaxation | LOW | Single pilot (PubMed 30549622) |
| Frankincense | Relaxation/anxiety | INSUFFICIENT-LOW | Mostly animal; human RCT unverifiable |
| Eucalyptus | Alertness/energizing | INSUFFICIENT | No isolated human RCT found |

## Safety notes surfaced in the product

- **Pets, especially cats.** Cats lack the glucuronyl transferase enzyme
  needed to metabolize many essential oil compounds, and passive diffuser
  vapor exposure (not just ingestion) can cause toxicity. Oils of concern
  include tea tree, citrus/limonene, peppermint, ylang ylang, eucalyptus,
  cinnamon, clove, pennyroyal, and wintergreen. This is treated as the
  single most important safety warning in the product.
- **Asthma/respiratory sensitivity.** Strong-smelling oils (eucalyptus,
  peppermint, camphor-type oils) can trigger irritation or bronchospasm in
  sensitive individuals; eucalyptus is specifically contraindicated for
  infants and young children.
- **Photosensitivity.** Cold-pressed citrus oils (bergamot, lemon, lime,
  grapefruit, bitter orange) can cause phototoxic reactions — relevant
  mainly to topical use, not diffusion, but noted for completeness.
- **Pregnancy.** General caution is advised; a blanket "consult your
  doctor" disclaimer is used rather than any oil-specific medical claim.

## Product-level editorial rules derived from this review

1. Never say "studies show" for a LOW or INSUFFICIENT rated claim — use
   hedged language like "early research suggests" or "some people report."
2. Never state a treatment or medical claim (no "reduces anxiety
   disorder," no "treats insomnia") — only "may help some people feel
   calmer," anchored to the confidence level.
3. Every scent recommendation shown to a user must be traceable to a
   specific entry in `scentLibrary.ts`, which itself cites this document.
4. The pet-safety warning is shown independently of the wellness-claims
   UI and is never suppressed by a high confidence rating on the wellness
   side.
