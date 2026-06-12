-- Production-safe completion of operation architecture rollout.
-- Idempotent by design: safe to run multiple times and on partially migrated environments.

-- 1) Missing nullable operationId columns
ALTER TABLE "OperationalQueue"
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

ALTER TABLE "Route"
  ADD COLUMN IF NOT EXISTS "operationId" TEXT;

-- 2) Nullable FKs to DailyOperation (Operation @@map("DailyOperation"))
DO $$
BEGIN
  ALTER TABLE "OperationalQueue"
    ADD CONSTRAINT "OperationalQueue_operationId_fkey"
    FOREIGN KEY ("operationId")
    REFERENCES "DailyOperation"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Route"
    ADD CONSTRAINT "Route_operationId_fkey"
    FOREIGN KEY ("operationId")
    REFERENCES "DailyOperation"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Required indexes
CREATE INDEX IF NOT EXISTS "OperationalQueue_operationId_idx"
  ON "OperationalQueue"("operationId");

CREATE INDEX IF NOT EXISTS "Route_operationId_idx"
  ON "Route"("operationId");

-- 4) Backfill without overwriting existing values
-- 4a) Prefer explicit legacy dailyOperationId links when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'OperationalQueue'
      AND column_name = 'dailyOperationId'
  ) THEN
    EXECUTE '
      UPDATE "OperationalQueue"
      SET "operationId" = "dailyOperationId"
      WHERE "operationId" IS NULL
        AND "dailyOperationId" IS NOT NULL
    ';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Route'
      AND column_name = 'dailyOperationId'
  ) THEN
    EXECUTE '
      UPDATE "Route"
      SET "operationId" = "dailyOperationId"
      WHERE "operationId" IS NULL
        AND "dailyOperationId" IS NOT NULL
    ';
  END IF;
END $$;

-- 4b) Fallback backfill by tenant + day (legacy implicit linkage)
UPDATE "OperationalQueue" q
SET "operationId" = o."id"
FROM "DailyOperation" o
WHERE q."operationId" IS NULL
  AND q."tenantId" = o."tenantId"
  AND DATE_TRUNC('day', q."appointmentDate") = DATE_TRUNC('day', o."date");

UPDATE "Route" r
SET "operationId" = o."id"
FROM "DailyOperation" o
WHERE r."operationId" IS NULL
  AND r."tenantId" = o."tenantId"
  AND DATE_TRUNC('day', r."date") = DATE_TRUNC('day', o."date");

-- 5) operation_events table (create only if missing)
CREATE TABLE IF NOT EXISTS "operation_events" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "operationId" TEXT,
  "routeId" TEXT,
  "tripId" TEXT,
  "patientId" TEXT,
  "eventType" TEXT NOT NULL,
  "actorType" TEXT,
  "actorId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- 6) operation_events indexes
CREATE INDEX IF NOT EXISTS "operation_events_tenantId_idx"
  ON "operation_events"("tenantId");
CREATE INDEX IF NOT EXISTS "operation_events_operationId_idx"
  ON "operation_events"("operationId");
CREATE INDEX IF NOT EXISTS "operation_events_routeId_idx"
  ON "operation_events"("routeId");
CREATE INDEX IF NOT EXISTS "operation_events_tripId_idx"
  ON "operation_events"("tripId");
CREATE INDEX IF NOT EXISTS "operation_events_patientId_idx"
  ON "operation_events"("patientId");
CREATE INDEX IF NOT EXISTS "operation_events_eventType_idx"
  ON "operation_events"("eventType");
