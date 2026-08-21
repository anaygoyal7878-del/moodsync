-- Reinforcement tracking for remembered facts. Written as a forward
-- migration rather than an edit to 20260820140000 because that one is
-- already committed and may have been applied.

-- AlterTable: add nullable first so existing rows can be backfilled.
ALTER TABLE "messaging_memory_facts" ADD COLUMN "normalized" TEXT;
ALTER TABLE "messaging_memory_facts" ADD COLUMN "reinforcedCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "messaging_memory_facts" ADD COLUMN "lastReinforcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: must match normalizeFact() in
-- database/src/repositories/messagingMemoryRepository.ts exactly, or
-- pre-existing rows would never match a new save and would duplicate.
UPDATE "messaging_memory_facts"
SET "normalized" = btrim(
  regexp_replace(
    regexp_replace(lower("fact"), '[^a-z0-9[:space:]]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )
);

-- Existing near-duplicates would violate the unique constraint below.
-- Collapse them onto the newest row, carrying the count forward so the
-- reinforcement signal reflects what actually happened rather than
-- resetting to 1.
UPDATE "messaging_memory_facts" AS keep
SET "reinforcedCount" = sub."total"
FROM (
  SELECT "userId", "normalized", COUNT(*)::int AS "total",
         MAX("createdAt") AS "newest"
  FROM "messaging_memory_facts"
  GROUP BY "userId", "normalized"
  HAVING COUNT(*) > 1
) AS sub
WHERE keep."userId" = sub."userId"
  AND keep."normalized" = sub."normalized"
  AND keep."createdAt" = sub."newest";

DELETE FROM "messaging_memory_facts" AS dup
WHERE EXISTS (
  SELECT 1 FROM "messaging_memory_facts" AS other
  WHERE other."userId" = dup."userId"
    AND other."normalized" = dup."normalized"
    AND (other."createdAt" > dup."createdAt"
         OR (other."createdAt" = dup."createdAt" AND other."id" > dup."id"))
);

ALTER TABLE "messaging_memory_facts" ALTER COLUMN "normalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "messaging_memory_facts_userId_normalized_key" ON "messaging_memory_facts"("userId", "normalized");
CREATE INDEX "messaging_memory_facts_userId_lastReinforcedAt_idx" ON "messaging_memory_facts"("userId", "lastReinforcedAt");
DROP INDEX "messaging_memory_facts_userId_createdAt_idx";
