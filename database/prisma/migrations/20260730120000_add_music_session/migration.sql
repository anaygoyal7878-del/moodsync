-- CreateEnum
CREATE TYPE "MusicMode" AS ENUM ('FOCUS', 'RELAX', 'SLEEP', 'RECOVERY', 'MORNING', 'WORKOUT');

-- CreateEnum
CREATE TYPE "MusicProviderKind" AS ENUM ('APPLE_MUSIC', 'SPOTIFY', 'OTHER');

-- CreateTable
CREATE TABLE "music_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "MusicMode" NOT NULL,
    "provider" "MusicProviderKind" NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemKind" TEXT NOT NULL,
    "itemExternalId" TEXT,
    "genre" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "baselineHeartRate" INTEGER,
    "baselineStressScore" INTEGER,
    "baselineRecoveryScore" INTEGER,
    "outcomeHeartRateDelta" INTEGER,
    "outcomeStressDelta" INTEGER,
    "outcomeConfidence" TEXT,
    "outcomeSummary" TEXT,
    "endedEarly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "music_sessions_userId_startedAt_idx" ON "music_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "music_sessions_userId_mode_idx" ON "music_sessions"("userId", "mode");

-- AddForeignKey
ALTER TABLE "music_sessions" ADD CONSTRAINT "music_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
