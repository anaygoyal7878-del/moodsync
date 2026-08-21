-- CreateTable
CREATE TABLE "mood_check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "valence" INTEGER NOT NULL,
    "arousal" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mood_check_ins_userId_createdAt_idx" ON "mood_check_ins"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "mood_check_ins" ADD CONSTRAINT "mood_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
