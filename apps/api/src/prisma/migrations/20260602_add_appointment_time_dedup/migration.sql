-- Add appointmentTime to operational_demands for proper deduplication
-- This allows same patient/location/date with DIFFERENT times to create separate demands

BEGIN;

-- Add appointmentTime column
ALTER TABLE "operational_demands"
ADD COLUMN "appointmentTime" TEXT;

-- Populate appointmentTime from existing appointmentDate (extract HH:MM)
UPDATE "operational_demands"
SET "appointmentTime" = TO_CHAR("appointmentDate", 'HH24:MI');

-- Make it NOT NULL with default for new records
ALTER TABLE "operational_demands"
ALTER COLUMN "appointmentTime" SET NOT NULL,
ALTER COLUMN "appointmentTime" SET DEFAULT '08:00';

-- Drop old unique index to replace it
DROP INDEX IF EXISTS "operational_demands_tenantId_patientId_healthcareLocationId_appoint_key";

-- Create new unique index with time component
-- Using DATE_TRUNC to ensure date-only comparison, but include time in index
CREATE UNIQUE INDEX "operational_demands_tenantId_patientId_healthcareLocationId_appointmentDate_appointmentTime_key"
ON "operational_demands"("tenantId", "patientId", "healthcareLocationId", DATE_TRUNC('day', "appointmentDate"), "appointmentTime");

-- Add unique constraint on OperationalQueue.demandId for 1:1 relationship
ALTER TABLE "OperationalQueue"
ADD CONSTRAINT "OperationalQueue_demandId_key" UNIQUE ("demandId");

-- Create index on Operation.status for faster protection checks in recovery functions
CREATE INDEX IF NOT EXISTS "DailyOperation_tenantId_status_idx"
ON "DailyOperation"("tenantId", "status");

COMMIT;
