import { prisma } from '../prismaClient.js';

export interface LogPlayInput {
  userId: string;
  ruleId: string;
  playlistUri: string;
}

/** Backs the Spotify play-history / skip-signal feature — see
 * `MusicPlayLog` in schema.prisma and
 * `workers/src/spotifyPlaybackCheckWorker.ts`. */
export const musicPlayLogRepository = {
  async logPlay(input: LogPlayInput): Promise<void> {
    await prisma.musicPlayLog.create({
      data: { userId: input.userId, ruleId: input.ruleId, playlistUri: input.playlistUri },
    });
  },

  /** Rows old enough to plausibly have finished the "did it get skipped"
   * window, still unchecked — the worker's unit of work. `olderThan` is
   * a cutoff timestamp (now minus the check delay), not a duration, so
   * the query stays a plain comparison. */
  async listUncheckedOlderThan(olderThan: Date) {
    return prisma.musicPlayLog.findMany({
      where: { likedSignal: null, playedAt: { lt: olderThan } },
      orderBy: { playedAt: 'asc' },
    });
  },

  async setLikedSignal(id: string, likedSignal: boolean): Promise<void> {
    await prisma.musicPlayLog.update({ where: { id }, data: { likedSignal } });
  },

  /** Most recent `limit` checked plays for one playlist URI — what
   * `ai/src/recommendations.ts`'s skip-rate heuristic scores. */
  async listRecentCheckedForPlaylist(userId: string, playlistUri: string, limit: number) {
    return prisma.musicPlayLog.findMany({
      where: { userId, playlistUri, likedSignal: { not: null } },
      orderBy: { playedAt: 'desc' },
      take: limit,
    });
  },

  /** Every distinct (userId, playlistUri) pair the user has actually
   * played via an automation — what the recommendation heuristic scans
   * rather than iterating every rule's params by hand. */
  async listDistinctPlaylistsForUser(userId: string): Promise<string[]> {
    const rows = await prisma.musicPlayLog.findMany({
      where: { userId },
      select: { playlistUri: true },
      distinct: ['playlistUri'],
    });
    return rows.map((r) => r.playlistUri);
  },
};
