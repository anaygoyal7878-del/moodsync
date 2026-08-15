-- CreateEnum
CREATE TYPE "EnvironmentAutomationLevel" AS ENUM ('SUGGEST', 'ASSIST', 'AUTOMATE');

-- CreateEnum
CREATE TYPE "EnvironmentSessionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'DISMISSED', 'AUTO_APPLIED');

-- CreateTable
CREATE TABLE "environment_automation_settings" (
    "userId" TEXT NOT NULL,
    "level" "EnvironmentAutomationLevel" NOT NULL DEFAULT 'SUGGEST',
    "lightingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "musicEnabled" BOOLEAN NOT NULL DEFAULT true,
    "temperatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sceneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLightingDeltaPct" INTEGER NOT NULL DEFAULT 25,
    "maxTemperatureDeltaC" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "blockedHoursStart" INTEGER,
    "blockedHoursEnd" INTEGER,
    "lastManualOverrideAt" TIMESTAMP(3),
    "lastAutomationAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_automation_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "environment_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "signalsJson" TEXT NOT NULL,
    "proposalJson" TEXT NOT NULL,
    "status" "EnvironmentSessionStatus" NOT NULL DEFAULT 'PROPOSED',
    "baselineHeartRate" INTEGER,
    "baselineStressScore" INTEGER,
    "outcomeHeartRateDelta" DOUBLE PRECISION,
    "outcomeStressDelta" DOUBLE PRECISION,
    "outcomeConfidence" TEXT,
    "outcomeSummary" TEXT,
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "environment_sessions_userId_createdAt_idx" ON "environment_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "environment_sessions_userId_state_status_idx" ON "environment_sessions"("userId", "state", "status");

-- AddForeignKey
ALTER TABLE "environment_automation_settings" ADD CONSTRAINT "environment_automation_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_sessions" ADD CONSTRAINT "environment_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
