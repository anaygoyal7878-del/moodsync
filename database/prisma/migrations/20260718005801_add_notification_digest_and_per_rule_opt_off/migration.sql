-- CreateEnum
CREATE TYPE "NotificationDigestMode" AS ENUM ('IMMEDIATE', 'HOURLY');

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "notificationDigestMode" "NotificationDigestMode" NOT NULL DEFAULT 'IMMEDIATE';

-- CreateTable
CREATE TABLE "pending_notification_digest_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ruleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_notification_digest_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_notification_digest_entries_userId_createdAt_idx" ON "pending_notification_digest_entries"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "pending_notification_digest_entries" ADD CONSTRAINT "pending_notification_digest_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
