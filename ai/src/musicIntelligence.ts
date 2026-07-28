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

export interface MusicRecommendationResult {
  category: MusicCategory;
  keywords: string[];
  /** Human-readable reason, same "explain the decision" convention as
   * ai/src/explain.ts. */
  reason: string;
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

  if (weatherCondition === 'rain' || weatherCondition === 'storm') {
    return { category: 'Rainy Day', keywords: MUSIC_CATEGORY_KEYWORDS['Rainy Day'], reason: 'It looks rainy outside right now.' };
  }

  if (stress !== null && stress >= STRESS_THRESHOLD) {
    return { category: 'Relax', keywords: MUSIC_CATEGORY_KEYWORDS.Relax, reason: `Your computed Stress score is elevated (${stress}).` };
  }

  if (hourOfDay >= MORNING_START_HOUR && hourOfDay < MORNING_END_HOUR) {
    return { category: 'Morning', keywords: MUSIC_CATEGORY_KEYWORDS.Morning, reason: 'It’s morning.' };
  }

  if (recovery !== null && recovery <= LOW_RECOVERY_THRESHOLD) {
    return { category: 'Recovery', keywords: MUSIC_CATEGORY_KEYWORDS.Recovery, reason: `Your computed Recovery score is low (${recovery}).` };
  }

  if (hourOfDay >= WORKDAY_START_HOUR && hourOfDay < WORKDAY_END_HOUR) {
    return { category: 'Focus', keywords: MUSIC_CATEGORY_KEYWORDS.Focus, reason: 'It’s typical working hours.' };
  }

  return { category: 'Relax', keywords: MUSIC_CATEGORY_KEYWORDS.Relax, reason: 'No stronger signal right now.' };
}
