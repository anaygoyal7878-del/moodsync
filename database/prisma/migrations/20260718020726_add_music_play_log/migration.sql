-- CreateTable
CREATE TABLE "music_play_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "playlistUri" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likedSignal" BOOLEAN,

    CONSTRAINT "music_play_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "music_play_logs_userId_playlistUri_idx" ON "music_play_logs"("userId", "playlistUri");

-- CreateIndex
CREATE INDEX "music_play_logs_likedSignal_playedAt_idx" ON "music_play_logs"("likedSignal", "playedAt");

-- AddForeignKey
ALTER TABLE "music_play_logs" ADD CONSTRAINT "music_play_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
