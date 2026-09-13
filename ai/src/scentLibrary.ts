/**
 * The Nature's Note fragrance catalog, transcribed from
 * naturesnotefragrances.com (visited 2026-08-20).
 *
 * ## What is real here and what is not
 *
 * **Real, taken verbatim from the site:** the Solaris and Everwood
 * entries, their marketing descriptions, the "From $15" pricing, and —
 * for Solaris only — the full top/heart/base note breakdown the site
 * publishes in its "Scent Architecture" section, along with the timing
 * bands it states (top 0-30 min, heart 30 min-4 hrs, base 4+ hrs).
 *
 * **A deliberate subset, not the whole site.** The brand lists more
 * fragrances than this file carries; MoodSync recommends from Solaris
 * and Everwood only. That is a product decision, not a transcription
 * gap, and it is recorded here so nobody "fixes" this file by adding
 * back an entry they find on the site.
 *
 * **Deliberately absent:** Everwood's note pyramid. The site's Scent
 * Architecture panel is tabbed and only Solaris's tab content was
 * retrievable, so Everwood's `notes` field is `null` rather than
 * invented. A cologne's note pyramid is its actual formula — guessing
 * "probably oud and leather" for a real product a real business sells
 * would be fabricating a spec sheet. `null` propagates honestly: the UI
 * shows the description instead, and `scentIntelligence.ts` matches on
 * the `character` axes below rather than on notes it doesn't have.
 *
 * **Derived, not claimed as the brand's own:** the `character` numbers.
 * These are MoodSync's reading of each fragrance's published
 * description, used only to rank recommendations. They are not
 * measurements and the site does not publish them.
 */

export type ScentId = 'solaris' | 'everwood';

export interface ScentNotes {
  /** 0-30 min per the site — the first impression. */
  top: string[];
  /** 30 min - 4 hrs. */
  heart: string[];
  /** 4+ hrs. */
  base: string[];
}

export interface ScentCharacter {
  /** 0-1. How bright/citrus-forward versus deep/resinous. */
  brightness: number;
  /** 0-1. How much presence it projects — quiet skin scent to
   * room-filling. */
  intensity: number;
  /** 0-1. How warm/smoky the base reads. */
  warmth: number;
}

export interface Scent {
  id: ScentId;
  name: string;
  /** The site's own tagline for the fragrance. */
  tagline: string;
  /** The site's own description, quoted rather than paraphrased. */
  description: string;
  /** Null when the brand doesn't publish the pyramid — never guessed.
   * See this file's header. */
  notes: ScentNotes | null;
  character: ScentCharacter;
}

/** The site states these bands explicitly in its Scent Architecture
 * panel. Used to tell the user when to apply relative to an event
 * rather than just which bottle to reach for. */
export const NOTE_TIMING = {
  topMinutes: 30,
  heartHours: 4,
  baseLabel: '4+ hrs',
} as const;

export const SCENTS: Record<ScentId, Scent> = {
  solaris: {
    id: 'solaris',
    name: 'Solaris',
    tagline: 'The Signature',
    description:
      'Bright and sophisticated. A warm embrace of citrus and wood — crafted for the man who commands every room he enters.',
    notes: {
      top: ['Bergamot', 'Lemon', 'Ginger'],
      heart: ['Cedarwood', 'Lavender', 'Sage'],
      base: ['Sandalwood', 'Amber', 'Musk'],
    },
    character: { brightness: 0.85, intensity: 0.55, warmth: 0.5 },
  },
  everwood: {
    id: 'everwood',
    name: 'Everwood',
    tagline: 'Timeless Sophistication',
    description: 'Bold and commanding. A masterful balance of strength and elegance for unforgettable moments.',
    // Not published on the site's Scent Architecture panel in a form
    // that could be read. Left null rather than invented.
    notes: null,
    character: { brightness: 0.4, intensity: 0.8, warmth: 0.65 },
  },
};

export const ALL_SCENTS: Scent[] = Object.values(SCENTS);

/**
 * Pulse points, straight from the site's application guide, with the
 * projection trade-off it describes: *"Hot areas project more strongly,
 * while cooler areas provide subtler, longer-lasting scent."*
 *
 * `projection` encodes that trade-off so the recommender can pick a
 * placement to match the occasion — a close-quarters dinner and a
 * conference room want different answers from the same bottle.
 */
export type PulsePoint = 'lower-jaw' | 'neck' | 'chest' | 'inner-elbow' | 'wrist';

export interface PulsePointInfo {
  id: PulsePoint;
  label: string;
  /** The site's own one-line description. */
  note: string;
  /** 'strong' = warmer skin, projects more. 'subtle' = cooler, quieter
   * and longer-lasting. */
  projection: 'strong' | 'moderate' | 'subtle';
}

export const PULSE_POINTS: Record<PulsePoint, PulsePointInfo> = {
  'lower-jaw': {
    id: 'lower-jaw',
    label: 'Lower jaw',
    note: 'Behind the jawline for subtle projection',
    projection: 'subtle',
  },
  neck: { id: 'neck', label: 'Neck', note: 'Classic spot for all-day wear', projection: 'strong' },
  chest: { id: 'chest', label: 'Chest', note: 'Warms with body heat throughout the day', projection: 'strong' },
  'inner-elbow': {
    id: 'inner-elbow',
    label: 'Inner elbow',
    note: 'Moves with your arms for subtle wafts',
    projection: 'moderate',
  },
  wrist: {
    id: 'wrist',
    label: 'Wrist',
    note: 'Easy to reapply and brings scent closer when needed',
    projection: 'moderate',
  },
};

/**
 * Application rules the site states as rules, kept verbatim because
 * they're the brand's guidance rather than MoodSync's opinion. Shown
 * alongside a recommendation so the advice is complete — knowing which
 * cologne is useless if you spray it into a cloud and walk through it.
 */
export const APPLICATION_RULES: string[] = [
  'Start with one spray and build up if needed.',
  'Apply to skin, not clothes — fragrance interacts with your body chemistry.',
  'Apply to dry, clean skin after a shower so it lasts longer.',
  'Never walk into a spray cloud. Apply directly to pulse points.',
  'Never rub it in — that breaks down the fragrance molecules.',
  'Choose 2-3 pulse points maximum. More is not better.',
];

/** The site caps this explicitly: "Choose 2-3 pulse points maximum.
 * More is not better." The recommender never returns more. */
export const MAX_PULSE_POINTS = 2;
