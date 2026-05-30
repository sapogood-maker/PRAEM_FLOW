-- Safe transition for OperationShift and legacy OperationStatus values.
-- Keeps dailyOperationId, adds operationId, and backfills new rows from the legacy link.

-- 1. Preserve the legacy column and add the new one.
ALTER TABLE "OperationShift"
  ADD COLUMN IF NOT EXISTS "dailyOperationId" TEXT,
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

-- 2. Keep both foreign keys nullable during the rollout.
DO $$
BEGIN
  ALTER TABLE "OperationShift"
    ADD CONSTRAINT "OperationShift_dailyOperationId_fkey"
    FOREIGN KEY ("dailyOperationId")
    REFERENCES "DailyOperation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

-- 3. Supporting indexes for both access paths.
CREATE INDEX IF NOT EXISTS "OperationShift_tenantId_idx"
  ON "OperationShift"("tenantId");

CREATE INDEX IF NOT EXISTS "OperationShift_dailyOperationId_idx"
  ON "OperationShift"("dailyOperationId");

CREATE INDEX IF NOT EXISTS "OperationShift_operationId_idx"
  ON "OperationShift"("operationId");

-- 4. Backfill the new column from the legacy one without touching existing rows otherwise.
UPDATE "OperationShift"
SET "operationId" = "dailyOperationId"
WHERE "operationId" IS NULL
  AND "dailyOperationId" IS NOT NULL;

-- 4b. Keep the legacy column populated too when only the new one exists.
UPDATE "OperationShift"
SET "dailyOperationId" = "operationId"
WHERE "dailyOperationId" IS NULL
  AND "operationId" IS NOT NULL;

-- 5. Legacy OperationStatus mapping.
--    This keeps the enum cleanup safe by remapping stored values before any later removal of old labels.
ALTER TYPE "OperationStatus" ADD VALUE IF NOT EXISTS 'IMPORTED';
ALTER TYPE "OperationStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "OperationStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

UPDATE "DailyOperation"
SET "status" = CASE "status"
  WHEN 'PLANNING' THEN 'IMPORTED'
  WHEN 'ACTIVE' THEN 'IN_TRANSIT'
  WHEN 'CLOSED' THEN 'COMPLETED'
  ELSE "status"
END
WHERE "status" IN ('PLANNING', 'ACTIVE', 'CLOSED');
