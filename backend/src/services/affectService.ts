import { moodCheckInRepository, biometricReadingRepository } from '@moodsync/database';
import { learnAffect, learningStatus, type AffectLearning } from '@moodsync/ai';

/**
 * Trains this person's affect model from their own check-ins and
 * readings. See docs/AFFECT_MODEL_ARCHITECTURE.md.
 *
 * Trains on read, not on a schedule. At these sample sizes a full fit
 * is a few milliseconds of arithmetic over at most a few hundred rows,
 * so a cached model would add staleness and invalidation bugs to buy
 * nothing. If the feature ever grows past that, this is the seam where
 * a stored model would go.
 */

/** Readings pulled to build features. Must comfortably exceed the
 * check-in window, because each check-in's baseline is computed from
 * the readings *before* it — too short a history and early check-ins
 * have no baseline and get dropped. */
const READING_HISTORY = 2000;

export interface AffectSummary extends AffectLearning {
  /** One sentence naming which of the several "not yet" situations
   * this is — see learningStatus. */
  status: string;
}

export const affectService = {
  async recordCheckIn(userId: string, valence: number, arousal: number, note?: string | null) {
    return moodCheckInRepository.create({ userId, valence, arousal, note: note ?? null });
  },

  async getLearning(userId: string): Promise<AffectSummary> {
    const [checkIns, readings] = await Promise.all([
      moodCheckInRepository.listForUser(userId),
      biometricReadingRepository.listRecentNormalized(userId, READING_HISTORY),
    ]);

    const learning = learnAffect(
      checkIns.map((c) => ({ valence: c.valence, arousal: c.arousal, createdAt: c.createdAt })),
      readings,
    );

    return { ...learning, status: learningStatus(learning) };
  },

  async listCheckIns(userId: string) {
    return moodCheckInRepository.listForUser(userId, 50);
  },

  async removeCheckIn(userId: string, id: string) {
    return moodCheckInRepository.remove(userId, id);
  },
};
