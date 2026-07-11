-- CreateEnum
CREATE TYPE "WearableProvider" AS ENUM ('WHOOP', 'GOOGLE_HEALTH', 'GARMIN');

-- CreateEnum
CREATE TYPE "SmartHomeProvider" AS ENUM ('HUE', 'SPOTIFY', 'ECOBEE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR', 'NOT_YET_AVAILABLE');

-- CreateEnum
CREATE TYPE "ExecutionOutcome" AS ENUM ('EXECUTED', 'SKIPPED_COOLDOWN', 'SKIPPED_DISABLED', 'FAILED');

-- CreateEnum
CREATE TYPE "InsightPeriod" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "accessTokenCiphertext" BYTEA NOT NULL,
    "accessTokenNonce" BYTEA NOT NULL,
    "refreshTokenCiphertext" BYTEA,
    "refreshTokenNonce" BYTEA,
    "providerSecretCiphertext" BYTEA,
    "providerSecretNonce" BYTEA,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "WearableProvider" NOT NULL,
    "providerUserId" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "oauthTokenId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wearable_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_home_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SmartHomeProvider" NOT NULL,
    "providerAccountId" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "oauthTokenId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_home_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_devices" (
    "id" TEXT NOT NULL,
    "smartHomeConnectionId" TEXT NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "room" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connected_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_readings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "WearableProvider" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "heartRate" DOUBLE PRECISION,
    "restingHeartRate" DOUBLE PRECISION,
    "sleepScore" DOUBLE PRECISION,
    "recoveryScore" DOUBLE PRECISION,
    "stressLevel" DOUBLE PRECISION,
    "activityLevel" DOUBLE PRECISION,
    "steps" INTEGER,
    "calories" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggerReadingId" TEXT,
    "outcome" "ExecutionOutcome" NOT NULL,
    "failureReason" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" "InsightPeriod" NOT NULL,
    "metric" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "trend" DOUBLE PRECISION,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedActions" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" TEXT NOT NULL,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "automationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preferredUnits" TEXT NOT NULL DEFAULT 'imperial',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_connections_oauthTokenId_key" ON "wearable_connections"("oauthTokenId");

-- CreateIndex
CREATE INDEX "wearable_connections_provider_status_idx" ON "wearable_connections"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_connections_userId_provider_key" ON "wearable_connections"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "smart_home_connections_oauthTokenId_key" ON "smart_home_connections"("oauthTokenId");

-- CreateIndex
CREATE INDEX "smart_home_connections_provider_status_idx" ON "smart_home_connections"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "smart_home_connections_userId_provider_key" ON "smart_home_connections"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "connected_devices_smartHomeConnectionId_externalDeviceId_key" ON "connected_devices"("smartHomeConnectionId", "externalDeviceId");

-- CreateIndex
CREATE INDEX "biometric_readings_userId_timestamp_idx" ON "biometric_readings"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "automation_rules_userId_enabled_idx" ON "automation_rules"("userId", "enabled");

-- CreateIndex
CREATE INDEX "automation_execution_logs_userId_executedAt_idx" ON "automation_execution_logs"("userId", "executedAt");

-- CreateIndex
CREATE INDEX "automation_execution_logs_ruleId_executedAt_idx" ON "automation_execution_logs"("ruleId", "executedAt");

-- CreateIndex
CREATE INDEX "insights_userId_period_periodStart_idx" ON "insights"("userId", "period", "periodStart");

-- CreateIndex
CREATE INDEX "recommendations_userId_status_idx" ON "recommendations"("userId", "status");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_oauthTokenId_fkey" FOREIGN KEY ("oauthTokenId") REFERENCES "oauth_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_home_connections" ADD CONSTRAINT "smart_home_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_home_connections" ADD CONSTRAINT "smart_home_connections_oauthTokenId_fkey" FOREIGN KEY ("oauthTokenId") REFERENCES "oauth_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_smartHomeConnectionId_fkey" FOREIGN KEY ("smartHomeConnectionId") REFERENCES "smart_home_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_readings" ADD CONSTRAINT "biometric_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
