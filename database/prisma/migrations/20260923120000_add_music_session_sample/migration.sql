-- Biometric samples taken *during* a music session.
--
-- music_sessions already stores a baseline and an outcome delta, which
-- answers "did anything change" but not "how did it change". A session
-- that dropped ten beats in the first two minutes and drifted back is a
-- different session from one that came down steadily, and the delta
-- alone reports them identically.

CREATE TABLE "music_session_samples" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    -- Absolute, not an offset, so a paused/resumed session still plots.
    "at" TIMESTAMP(3) NOT NULL,
    "heartRate" INTEGER,
    -- Nullable: stress needs HRV plus history, which not every device
    -- or moment provides.
    "stressScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_session_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "music_session_samples_sessionId_at_idx" ON "music_session_samples"("sessionId", "at");

ALTER TABLE "music_session_samples" ADD CONSTRAINT "music_session_samples_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "music_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
