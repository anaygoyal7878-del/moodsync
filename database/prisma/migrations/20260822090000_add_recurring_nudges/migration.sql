-- AlterTable
ALTER TABLE "messaging_settings" ADD COLUMN "recurringNudgesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messaging_settings" ADD COLUMN "recurringNudgeIntervalHours" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "messaging_settings" ADD COLUMN "lastRecurringNudgeAt" TIMESTAMP(3);
ALTER TABLE "messaging_settings" ADD COLUMN "lastRecurringNudgeKind" TEXT;
