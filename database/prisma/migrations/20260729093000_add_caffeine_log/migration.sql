-- CreateTable
CREATE TABLE "caffeine_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mg" INTEGER NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caffeine_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caffeine_logs_userId_loggedAt_idx" ON "caffeine_logs"("userId", "loggedAt");

-- AddForeignKey
ALTER TABLE "caffeine_logs" ADD CONSTRAINT "caffeine_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
