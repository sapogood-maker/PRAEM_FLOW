ALTER TYPE "QueueStatus" ADD VALUE IF NOT EXISTS 'WAITING_DISPATCH';

CREATE TABLE "operational_demands" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceImportId" TEXT,
  "patientId" TEXT NOT NULL,
  "healthcareLocationId" TEXT NOT NULL,
  "appointmentDate" TIMESTAMP(3) NOT NULL,
  "priority" "QueuePriority" NOT NULL DEFAULT 'NORMAL',
  "returnTrip" BOOLEAN NOT NULL DEFAULT false,
  "wheelchair" BOOLEAN NOT NULL DEFAULT false,
  "stretcher" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_demands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_demands_tenantId_patientId_healthcareLocationId_appoint_key"
ON "operational_demands"("tenantId", "patientId", "healthcareLocationId", "appointmentDate");

CREATE INDEX "operational_demands_tenantId_appointmentDate_idx"
ON "operational_demands"("tenantId", "appointmentDate");

CREATE INDEX "operational_demands_sourceImportId_idx"
ON "operational_demands"("sourceImportId");

ALTER TABLE "operational_demands"
ADD CONSTRAINT "operational_demands_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_demands"
ADD CONSTRAINT "operational_demands_sourceImportId_fkey"
FOREIGN KEY ("sourceImportId") REFERENCES "sus_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operational_demands"
ADD CONSTRAINT "operational_demands_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_demands"
ADD CONSTRAINT "operational_demands_healthcareLocationId_fkey"
FOREIGN KEY ("healthcareLocationId") REFERENCES "HealthcareLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalQueue"
ADD COLUMN "demandId" TEXT;

CREATE INDEX "OperationalQueue_demandId_idx"
ON "OperationalQueue"("demandId");

ALTER TABLE "OperationalQueue"
ADD CONSTRAINT "OperationalQueue_demandId_fkey"
FOREIGN KEY ("demandId") REFERENCES "operational_demands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
