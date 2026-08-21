-- CreateTable
CREATE TABLE "messaging_memory_facts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_memory_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messaging_memory_facts_userId_createdAt_idx" ON "messaging_memory_facts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "messaging_memory_facts" ADD CONSTRAINT "messaging_memory_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
