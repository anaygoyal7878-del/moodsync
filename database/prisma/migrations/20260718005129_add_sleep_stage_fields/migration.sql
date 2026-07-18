-- AlterTable
ALTER TABLE "biometric_readings" ADD COLUMN     "deepSleepMinutes" DOUBLE PRECISION,
ADD COLUMN     "lightSleepMinutes" DOUBLE PRECISION,
ADD COLUMN     "remSleepMinutes" DOUBLE PRECISION;
