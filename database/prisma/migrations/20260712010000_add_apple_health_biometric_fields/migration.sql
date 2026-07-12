-- Apple Health exposes heart rate variability (SDNN), respiratory rate,
-- and blood oxygen (SpO2) — confirmed real HealthKit quantity types with
-- no equivalent field in the existing schema. See
-- docs/APPLE_HEALTH_ARCHITECTURE.md §6.
ALTER TABLE "biometric_readings" ADD COLUMN "heartRateVariability" DOUBLE PRECISION;
ALTER TABLE "biometric_readings" ADD COLUMN "respiratoryRate" DOUBLE PRECISION;
ALTER TABLE "biometric_readings" ADD COLUMN "bloodOxygen" DOUBLE PRECISION;
