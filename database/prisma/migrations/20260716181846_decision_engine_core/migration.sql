-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExecutionOutcome" ADD VALUE 'SKIPPED_CONFLICT';
ALTER TYPE "ExecutionOutcome" ADD VALUE 'SKIPPED_MANUAL_PAUSE';
ALTER TYPE "ExecutionOutcome" ADD VALUE 'SKIPPED_SAFETY_RATE_LIMIT';

-- AlterTable
ALTER TABLE "automation_execution_logs" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "timeWindow" JSONB;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "automationsPausedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ruleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
