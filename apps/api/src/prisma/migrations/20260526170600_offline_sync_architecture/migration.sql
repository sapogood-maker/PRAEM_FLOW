-- Offline-first sync architecture

CREATE TABLE "processed_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "operationId" TEXT,
  "deviceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSED',
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_events_tenantId_eventId_key" ON "processed_events"("tenantId", "eventId");
CREATE INDEX "processed_events_tenantId_idx" ON "processed_events"("tenantId");
CREATE INDEX "processed_events_deviceId_idx" ON "processed_events"("deviceId");

ALTER TABLE "processed_events"
  ADD CONSTRAINT "processed_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "conflict_logs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "operationId" TEXT,
  "deviceId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "localStateJson" JSONB,
  "serverStateJson" JSONB,
  "resolution" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conflict_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conflict_logs_tenantId_idx" ON "conflict_logs"("tenantId");
CREATE INDEX "conflict_logs_eventId_idx" ON "conflict_logs"("eventId");

ALTER TABLE "conflict_logs"
  ADD CONSTRAINT "conflict_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
