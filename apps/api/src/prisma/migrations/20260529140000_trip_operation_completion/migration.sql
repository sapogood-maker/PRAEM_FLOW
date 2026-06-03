-- Production-safe stabilization for Trip.operationId rollout.
-- Idempotent by design and safe on partially migrated environments.

-- 1) Ensure nullable operationId exists on Trip.
ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

-- 2) Ensure FK Trip.operationId -> DailyOperation(id)
--    with ON DELETE SET NULL and ON UPDATE CASCADE.
DO $$
BEGIN
  ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_operationId_fkey"
    FOREIGN KEY ("operationId")
    REFERENCES "DailyOperation"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Ensure index exists.
CREATE INDEX IF NOT EXISTS "Trip_operationId_idx"
  ON "Trip"("operationId");

-- 4) Backfill operationId from Route.operationId when available.
--    Do not overwrite existing Trip.operationId values.
--    Guard Route.operationId existence for mixed schema states.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Route'
      AND column_name = 'operationId'
  ) THEN
    UPDATE "Trip" t
    SET "operationId" = r."operationId"
    FROM "Route" r
    WHERE t."operationId" IS NULL
      AND t."routeId" = r."id"
      AND r."operationId" IS NOT NULL;
  END IF;
END $$;
