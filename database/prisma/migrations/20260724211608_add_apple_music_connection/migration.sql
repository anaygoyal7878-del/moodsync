-- CreateTable
CREATE TABLE "apple_music_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "musicUserTokenCiphertext" BYTEA NOT NULL,
    "musicUserTokenNonce" BYTEA NOT NULL,
    "storefront" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_music_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apple_music_connections_userId_key" ON "apple_music_connections"("userId");

-- AddForeignKey
ALTER TABLE "apple_music_connections" ADD CONSTRAINT "apple_music_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
