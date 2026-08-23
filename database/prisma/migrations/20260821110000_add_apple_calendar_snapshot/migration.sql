-- CreateTable
CREATE TABLE "apple_calendar_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventsJson" JSONB NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apple_calendar_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apple_calendar_snapshots_userId_key" ON "apple_calendar_snapshots"("userId");

-- AddForeignKey
ALTER TABLE "apple_calendar_snapshots" ADD CONSTRAINT "apple_calendar_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
