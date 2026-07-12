-- Frequent-polling providers (e.g. Fitbit heart-rate samples on a 5-minute
-- worker cadence) can re-fetch a data point already inserted by a previous
-- run when its lookback window overlaps. This constraint lets bulkInsert
-- use skipDuplicates instead of accumulating repeats.
CREATE UNIQUE INDEX "biometric_readings_userId_provider_timestamp_key" ON "biometric_readings"("userId", "provider", "timestamp");
