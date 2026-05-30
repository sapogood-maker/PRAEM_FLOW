-- Operational architecture stabilization:
-- - Route-level operational awareness and versioning
-- - Trip versioning for optimistic locking
-- - Tracking points persistence for replay/analytics
-- - Operational timeline persistence

DO $$
BEGIN
  CREATE TYPE "RouteOperationalState" AS ENUM (
    'CREATED',
    'DISPATCHED',
    'DRIVER_ACCEPTED',
    'WAITING_PATIENT',
    'BOARDING',
    'PASSENGERS_ONBOARD',
    'IN_TRANSIT',
    'ARRIVED',
    'COMPLETED',
    'NO_SHOW',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Route"
  ADD COLUMN IF NOT EXISTS "operationalState" "RouteOperationalState" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS "operationalVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "TrackingPoint" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "routeId" TEXT,
  "driverId" TEXT,
  "vehicleId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "speed" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OperationalTimeline" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "routeId" TEXT,
  "tripId" TEXT,
  "patientId" TEXT,
  "driverId" TEXT,
  "vehicleId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT,
  "source" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  ALTER TABLE "TrackingPoint"
    ADD CONSTRAINT "TrackingPoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TrackingPoint"
    ADD CONSTRAINT "TrackingPoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OperationalTimeline"
    ADD CONSTRAINT "OperationalTimeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OperationalTimeline"
    ADD CONSTRAINT "OperationalTimeline_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OperationalTimeline"
    ADD CONSTRAINT "OperationalTimeline_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TrackingPoint_tenantId_idx" ON "TrackingPoint"("tenantId");
CREATE INDEX IF NOT EXISTS "TrackingPoint_routeId_idx" ON "TrackingPoint"("routeId");
CREATE INDEX IF NOT EXISTS "TrackingPoint_driverId_idx" ON "TrackingPoint"("driverId");
CREATE INDEX IF NOT EXISTS "TrackingPoint_vehicleId_idx" ON "TrackingPoint"("vehicleId");
CREATE INDEX IF NOT EXISTS "TrackingPoint_timestamp_idx" ON "TrackingPoint"("timestamp");

CREATE INDEX IF NOT EXISTS "OperationalTimeline_tenantId_idx" ON "OperationalTimeline"("tenantId");
CREATE INDEX IF NOT EXISTS "OperationalTimeline_routeId_idx" ON "OperationalTimeline"("routeId");
CREATE INDEX IF NOT EXISTS "OperationalTimeline_tripId_idx" ON "OperationalTimeline"("tripId");
CREATE INDEX IF NOT EXISTS "OperationalTimeline_patientId_idx" ON "OperationalTimeline"("patientId");
CREATE INDEX IF NOT EXISTS "OperationalTimeline_eventType_idx" ON "OperationalTimeline"("eventType");
CREATE INDEX IF NOT EXISTS "OperationalTimeline_createdAt_idx" ON "OperationalTimeline"("createdAt");
