-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('IMESSAGE', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessagingDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "messaging_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "handle" TEXT NOT NULL,
    "verificationCode" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_messages" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "MessagingDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "intent" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_connections_channel_handle_key" ON "messaging_connections"("channel", "handle");

-- CreateIndex
CREATE INDEX "messaging_connections_userId_idx" ON "messaging_connections"("userId");

-- CreateIndex
CREATE INDEX "messaging_messages_connectionId_createdAt_idx" ON "messaging_messages"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "messaging_connections" ADD CONSTRAINT "messaging_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "messaging_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
