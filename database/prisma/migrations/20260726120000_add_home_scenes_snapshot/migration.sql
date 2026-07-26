-- CreateEnum
CREATE TYPE "HomeAccessoryCategory" AS ENUM ('LOCK', 'GARAGE_DOOR', 'ALARM_SYSTEM', 'SMOKE_DETECTOR', 'LEAK_SENSOR', 'WINDOW_COVERING', 'DOORBELL', 'OUTLET_OR_SWITCH', 'LIGHT', 'THERMOSTAT_OR_SENSOR', 'OTHER');

-- AlterEnum
ALTER TYPE "ExecutionOutcome" ADD VALUE 'SKIPPED_SECURITY_CONTROL_DISABLED';

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN "securityControlEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "home_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "homeName" TEXT NOT NULL,
    "isMatterHome" BOOLEAN NOT NULL DEFAULT false,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_room_snapshots" (
    "id" TEXT NOT NULL,
    "homeSnapshotId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "temperatureC" DOUBLE PRECISION,
    "humidityPct" DOUBLE PRECISION,
    "airQuality" TEXT,

    CONSTRAINT "home_room_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_zone_snapshots" (
    "id" TEXT NOT NULL,
    "homeSnapshotId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomIds" TEXT[],

    CONSTRAINT "home_zone_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_accessory_snapshots" (
    "id" TEXT NOT NULL,
    "homeSnapshotId" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomId" TEXT,
    "category" "HomeAccessoryCategory" NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "firmwareVersion" TEXT,
    "reachable" BOOLEAN NOT NULL,
    "batteryLevelPct" INTEGER,
    "statusValue" TEXT,
    "isSecurityAccessory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "home_accessory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_scene_snapshots" (
    "id" TEXT NOT NULL,
    "homeSnapshotId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessoryIds" TEXT[],
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "home_scene_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_snapshots_userId_key" ON "home_snapshots"("userId");

-- CreateIndex
CREATE INDEX "home_room_snapshots_homeSnapshotId_idx" ON "home_room_snapshots"("homeSnapshotId");

-- CreateIndex
CREATE INDEX "home_zone_snapshots_homeSnapshotId_idx" ON "home_zone_snapshots"("homeSnapshotId");

-- CreateIndex
CREATE INDEX "home_accessory_snapshots_homeSnapshotId_idx" ON "home_accessory_snapshots"("homeSnapshotId");

-- CreateIndex
CREATE INDEX "home_scene_snapshots_homeSnapshotId_idx" ON "home_scene_snapshots"("homeSnapshotId");

-- AddForeignKey
ALTER TABLE "home_snapshots" ADD CONSTRAINT "home_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_room_snapshots" ADD CONSTRAINT "home_room_snapshots_homeSnapshotId_fkey" FOREIGN KEY ("homeSnapshotId") REFERENCES "home_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_zone_snapshots" ADD CONSTRAINT "home_zone_snapshots_homeSnapshotId_fkey" FOREIGN KEY ("homeSnapshotId") REFERENCES "home_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_accessory_snapshots" ADD CONSTRAINT "home_accessory_snapshots_homeSnapshotId_fkey" FOREIGN KEY ("homeSnapshotId") REFERENCES "home_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_scene_snapshots" ADD CONSTRAINT "home_scene_snapshots_homeSnapshotId_fkey" FOREIGN KEY ("homeSnapshotId") REFERENCES "home_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
