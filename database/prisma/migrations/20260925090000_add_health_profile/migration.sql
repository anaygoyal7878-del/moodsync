-- Body measurements a person chooses to tell MoodSync. Separate from
-- user_preferences, which is notification/automation configuration: this
-- is health data and should be exportable and deletable on its own.
--
-- Sex is deliberately not collected — the only calculation that would
-- use it (under-20 BMI percentiles) is not built.

CREATE TABLE "health_profiles" (
    "userId" TEXT NOT NULL,
    -- A date, not an age: a stored age silently goes wrong every birthday.
    "birthDate" TIMESTAMP(3),
    -- Metric is canonical; display units come from user preferences.
    "heightCm" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A log rather than a column: one value says what someone weighs, a
-- series says how it is moving.
CREATE TABLE "weight_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weight_entries_userId_recordedAt_idx" ON "weight_entries"("userId", "recordedAt");

ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
