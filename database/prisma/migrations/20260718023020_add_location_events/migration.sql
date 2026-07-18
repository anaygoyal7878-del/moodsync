-- CreateEnum
CREATE TYPE "LocationEventType" AS ENUM ('ARRIVED', 'DEPARTED');

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "locationTrigger" "LocationEventType";

-- CreateTable
CREATE TABLE "location_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LocationEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_events_userId_occurredAt_idx" ON "location_events"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
