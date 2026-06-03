-- Safety migration for OperationShift.operationId and DailyOperation.updatedAt.
-- Idempotent by design so it can run in environments that already applied equivalent transitions.

ALTER TABLE "DailyOperation"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "OperationShift"
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

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

CREATE INDEX IF NOT EXISTS "OperationShift_operationId_idx"
  ON "OperationShift"("operationId");
