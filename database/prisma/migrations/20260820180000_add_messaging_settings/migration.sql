-- CreateTable
CREATE TABLE "messaging_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "dailyProactiveLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_settings_userId_key" ON "messaging_settings"("userId");

-- AddForeignKey
ALTER TABLE "messaging_settings" ADD CONSTRAINT "messaging_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
