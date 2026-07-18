-- CreateTable
CREATE TABLE "resource_pauses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "pausedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_pauses_userId_resourceKey_key" ON "resource_pauses"("userId", "resourceKey");

-- AddForeignKey
ALTER TABLE "resource_pauses" ADD CONSTRAINT "resource_pauses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
