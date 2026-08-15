-- CreateTable
CREATE TABLE "state_observations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "state_observations_userId_observedAt_idx" ON "state_observations"("userId", "observedAt");

-- AddForeignKey
ALTER TABLE "state_observations" ADD CONSTRAINT "state_observations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
