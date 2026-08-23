-- CreateEnum
CREATE TYPE "PendingCalendarWriteStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "pending_calendar_writes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PendingCalendarWriteStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "pending_calendar_writes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_calendar_writes_userId_status_createdAt_idx" ON "pending_calendar_writes"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "pending_calendar_writes" ADD CONSTRAINT "pending_calendar_writes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
