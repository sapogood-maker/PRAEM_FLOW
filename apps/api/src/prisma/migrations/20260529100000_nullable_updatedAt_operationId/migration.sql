-- Safe migration: add nullable updatedAt and operationId
-- No database reset required — nullable columns are safe to add to tables with existing rows.
--
-- Operation (@@map "DailyOperation"): add updatedAt as nullable DateTime
-- OperationShift: add operationId as nullable TEXT with optional FK

-- 1. updatedAt on DailyOperation — nullable, no default constraint needed.
--    Prisma @updatedAt is handled by the client, not by a DB trigger.
ALTER TABLE "DailyOperation"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 2. operationId on OperationShift — nullable FK to DailyOperation.
ALTER TABLE "OperationShift"
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

-- 3. Foreign key constraint (nullable / SET NULL on delete).
DO $$
BEGIN
  ALTER TABLE "OperationShift"
    ADD CONSTRAINT "OperationShift_operationId_fkey"
    FOREIGN KEY ("operationId")
    REFERENCES "DailyOperation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Indexes (idempotent).
CREATE INDEX IF NOT EXISTS "OperationShift_tenantId_idx"
  ON "OperationShift"("tenantId");

CREATE INDEX IF NOT EXISTS "OperationShift_operationId_idx"
  ON "OperationShift"("operationId");

-- 5. Backfill: best-effort populate operationId from same-tenant Operation
--    whose date (day-truncated) is closest to the shift's createdAt.
--    Existing rows remain valid if no match is found (field stays NULL).
UPDATE "OperationShift" s
SET "operationId" = (
  SELECT o.id
  FROM "DailyOperation" o
  WHERE o."tenantId" = s."tenantId"
  ORDER BY ABS(
    EXTRACT(EPOCH FROM (
      DATE_TRUNC('day', o."date") - DATE_TRUNC('day', s."createdAt")
    ))
  )
  LIMIT 1
)
WHERE s."operationId" IS NULL;

-- 6. Backfill: populate updatedAt from createdAt for all existing rows.
UPDATE "DailyOperation"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;
