/** Mirrors `WeatherCondition` from @moodsync/integration-weather —
 * duplicated as a narrow local type rather than adding a cross-package
 * dependency just for one type; the caller (backend) already imports
 * both packages and passes a real value through. */
type WeatherConditionLike = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/**
 * Music Intelligence's "Recommended for Right Now" — picks one category
 * from real signals already available elsewhere in this codebase
 * (wellness scores, time of day, weather) and returns the keywords a
 * caller should match against the user's own connected playlist
 * library (Spotify/Apple Music) by name. Deliberately does NOT return a
 * playlist itself — MoodSync has no curated music catalog, and
 * fabricating one would misrepresent what this feature actually does.
 * See docs/MUSIC_INTELLIGENCE.md.
 */

export type MusicCategory = 'Rainy Day' | 'Relax' | 'Morning' | 'Recovery' | 'Focus' | 'Workout' | 'Reading';

/** Keyword lists a caller uses to match the category name against a
 * user's real playlist titles — same "best-effort keyword match, not
 * semantic understanding" heuristic already used for Apple Home scene
 * recommendations in ai/src/recommendations.ts. */
export const MUSIC_CATEGORY_KEYWORDS: Record<MusicCategory, string[]> = {
  'Rainy Day': ['rainy day', 'rain'],
  Relax: ['relax', 'calm', 'chill', 'wind down', 'unwind'],
  Morning: ['morning', 'wake up'],
  Recovery: ['recovery', 'rest'],
  Focus: ['focus', 'deep work', 'concentration'],
  Workout: ['workout', 'gym', 'exercise', 'training'],
  Reading: ['reading', 'read'],
};

export interface MusicRecommendationInput {
  stress: number | null;
  recovery: number | null;
  /** 0-23, local time. */
  hourOfDay: number;
  weatherCondition?: WeatherConditionLike | undefined;
}

/**
 * A target tempo range for a category, and where that range comes from.
 *
 * Why this is guidance and not a filter: matching a *playlist* by
 * keyword is all MoodSync can do today, because the Spotify integration
 * does not pull audio features (`/audio-features` — tempo, energy,
 * valence) and Apple Music is matched on library playlist names. So this
 * cannot rank the user's actual tracks by BPM. What it can honestly do
 * is say what tempo to reach for and why, which is useful on its own and
 * does not pretend to know the tempo of music it has never analysed.
 *
 * If the Spotify audio-features scope is added later, this is the shape
 * a real tempo-aware ranking would consume — the numbers would not need
 * to change, only what they are applied to.
 */
export interface TempoTarget {
  minBpm: number;
  maxBpm: number;
  /** Stated to the user, so a claim about their body is checkable
   * rather than something the app asserts. */
  basis: string;
  /** True when the range comes from published work, false when it is
   * MoodSync's own judgment. Kept explicit so the two never blur
   * together — the same distinction `healthScenarios.ts` draws. */
  researched: boolean;
}

/**
 * Tempo ranges per category.
 *
 * Two of these are genuinely research-backed and the rest are not, which
 * is exactly why `researched` exists rather than a comment hand-waving
 * at "studies show":
 *
 * - **60–80 BPM for calm.** Slow-tempo music in this band is repeatedly
 *   associated with reduced heart rate and lower physiological arousal,
 *   with music-therapy meta-analyses finding the larger effects roughly
 *   between 60 and 90 BPM. The proposed mechanism is entrainment — the
 *   body drifting toward an external rhythm — which is also why the
 *   range sits near a resting heart rate rather than far below it.
 * - **120–140 BPM for training.** Work on synchronous music and
 *   moderate-intensity aerobic exercise puts the useful band here, with
 *   a reported endurance improvement on the order of 20% versus no
 *   music, attributed to rhythmic auditory cues competing with internal
 *   fatigue signals and lowering perceived exertion.
 *
 * Focus, Morning and Reading get no tempo target at all. There is real
 * work on background music and cognition, but it disagrees with itself
 * on direction and depends heavily on task and personality — so
 * inventing "the focus BPM" would be dressing a guess in the same
 * language as the two findings above, which is the specific thing this
 * type is designed to prevent.
 */
export const CATEGORY_TEMPO: Partial<Record<MusicCategory, TempoTarget>> = {
  Relax: {
    minBpm: 60,
    maxBpm: 80,
    basis: 'Slow-tempo music around 60–80 BPM is associated with lower heart rate and reduced arousal, thought to work by the body entraining to the beat.',
    researched: true,
  },
  Recovery: {
    minBpm: 60,
    maxBpm: 80,
    basis: 'Slow, preferred music after hard exercise is associated with faster physiological settling than silence.',
    researched: true,
  },
  'Rainy Day': {
    minBpm: 60,
    maxBpm: 80,
    basis: 'Same slow-tempo range as Relax — this category is a calmer default, not a distinct physiological target.',
    researched: true,
  },
  Workout: {
    minBpm: 120,
    maxBpm: 140,
    basis: 'Music at 120–140 BPM is associated with meaningfully longer time to exhaustion during moderate-intensity aerobic work, by lowering perceived exertion.',
    researched: true,
  },
};

export interface MusicRecommendationResult {
  category: MusicCategory;
  keywords: string[];
  /** Human-readable reason, same "explain the decision" convention as
   * ai/src/explain.ts. */
  reason: string;
  /** Absent for categories with no defensible tempo target — see
   * `CATEGORY_TEMPO`. Absence is meaningful and should render as nothing
   * at all, not as a default range. */
  tempo?: TempoTarget;
}

const STRESS_THRESHOLD = 65;
const LOW_RECOVERY_THRESHOLD = 40;
const MORNING_START_HOUR = 5;
const MORNING_END_HOUR = 9;
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 17;

/** Priority order is MoodSync's own engineering judgment (not a
 * clinical/behavioral rule) — weather and acute stress take precedence
 * over a generic time-of-day default, since those are the more
 * "right now"-specific signals. Falls back to Focus during typical
 * working hours and Relax otherwise when nothing stronger applies. */
export function recommendMusicCategory(input: MusicRecommendationInput): MusicRecommendationResult {
  const { stress, recovery, hourOfDay, weatherCondition } = input;

  /** Single exit point, so the tempo target is attached from
   * `CATEGORY_TEMPO` rather than repeated per branch — a category added
   * later cannot ship with its tempo quietly forgotten in one branch. */
  const pick = (category: MusicCategory, reason: string): MusicRecommendationResult => {
    const tempo = CATEGORY_TEMPO[category];
    return { category, keywords: MUSIC_CATEGORY_KEYWORDS[category], reason, ...(tempo ? { tempo } : {}) };
  };

  if (weatherCondition === 'rain' || weatherCondition === 'storm') {
    return pick('Rainy Day', 'It looks rainy outside right now.');
  }

  if (stress !== null && stress >= STRESS_THRESHOLD) {
    return pick('Relax', `Your computed Stress score is elevated (${stress}).`);
  }

  if (hourOfDay >= MORNING_START_HOUR && hourOfDay < MORNING_END_HOUR) {
    return pick('Morning', 'It’s morning.');
  }

  if (recovery !== null && recovery <= LOW_RECOVERY_THRESHOLD) {
    return pick('Recovery', `Your computed Recovery score is low (${recovery}).`);
  }

  if (hourOfDay >= WORKDAY_START_HOUR && hourOfDay < WORKDAY_END_HOUR) {
    return pick('Focus', 'It’s typical working hours.');
  }

  return pick('Relax', 'No stronger signal right now.');
}
