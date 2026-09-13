-- Planned workouts: a plan first, a log second.
--
-- Distinct from meditation_sessions/focus_sessions, which only record
-- what already happened. Knowing about a workout *before* it happens is
-- what lets MoodSync remind someone in the morning and let recovery
-- signals argue with the plan while there is still time to change it.

CREATE TYPE "WorkoutKind" AS ENUM ('STRENGTH', 'CARDIO', 'MOBILITY', 'SPORT', 'REST');

CREATE TABLE "planned_workouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- A date, not a timestamp: people plan "legs on Thursday", not
    -- "legs at 17:30". Stored at UTC midnight and compared against the
    -- user's own timezone.
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "kind" "WorkoutKind" NOT NULL,
    "title" TEXT NOT NULL,
    "plannedMinutes" INTEGER,
    -- Local minutes past midnight, 0-1439. Null means remind with the
    -- morning plan rather than at a specific time.
    "plannedAtMinutes" INTEGER,
    "notes" TEXT,
    -- Null means still planned. A missed workout is data; deleting it
    -- would erase the fact that a plan was made and not kept.
    "completedAt" TIMESTAMP(3),
    "actualMinutes" INTEGER,
    "perceivedEffort" INTEGER,
    -- So the reminder worker never sends twice for one workout.
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_workouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planned_workouts_userId_scheduledFor_idx" ON "planned_workouts"("userId", "scheduledFor");

ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
