-- CreateEnum
CREATE TYPE "PendingDeviceCommandStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED');

-- AlterEnum
ALTER TYPE "ExecutionOutcome" ADD VALUE 'QUEUED_FOR_DEVICE';

-- AlterEnum
ALTER TYPE "SmartHomeProvider" ADD VALUE 'HOMEKIT';

-- CreateTable
CREATE TABLE "pending_device_commands" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SmartHomeProvider" NOT NULL,
    "action" JSONB NOT NULL,
    "ruleId" TEXT,
    "status" "PendingDeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "pending_device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_device_commands_userId_status_createdAt_idx" ON "pending_device_commands"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "pending_device_commands" ADD CONSTRAINT "pending_device_commands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
