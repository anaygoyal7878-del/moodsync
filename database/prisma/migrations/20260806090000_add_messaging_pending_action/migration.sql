-- CreateTable
CREATE TABLE "messaging_pending_actions" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argsJson" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_pending_actions_connectionId_key" ON "messaging_pending_actions"("connectionId");

-- AddForeignKey
ALTER TABLE "messaging_pending_actions" ADD CONSTRAINT "messaging_pending_actions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "messaging_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_pending_actions" ADD CONSTRAINT "messaging_pending_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
