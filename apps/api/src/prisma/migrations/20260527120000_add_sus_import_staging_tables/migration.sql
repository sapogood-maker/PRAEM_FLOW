-- SUS import staging tables
-- Goal: keep operational tables untouched until validated/approved processing.

DO $$
BEGIN
  CREATE TYPE "SusImportStatus" AS ENUM (
    'UPLOADED',
    'PREVIEW_READY',
    'VALIDATED',
    'PROCESSING',
    'PROCESSED',
    'FAILED',
    'REPROCESSED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SusImportRowStatus" AS ENUM (
    'PENDING',
    'VALID',
    'INVALID',
    'PROCESSED',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sus_imports" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "sourceSystem" TEXT NOT NULL DEFAULT 'SUS',
  "fileName" TEXT NOT NULL,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "status" "SusImportStatus" NOT NULL DEFAULT 'UPLOADED',
  "notes" TEXT,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "reprocessedFromImportId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sus_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sus_import_rows" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "rowHash" TEXT,
  "status" "SusImportRowStatus" NOT NULL DEFAULT 'PENDING',
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB,
  "validationErrors" JSONB,
  "validationWarnings" JSONB,
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sus_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sus_import_rows_importId_lineNumber_key" ON "sus_import_rows"("importId", "lineNumber");
CREATE INDEX IF NOT EXISTS "sus_imports_tenantId_createdAt_idx" ON "sus_imports"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "sus_imports_status_idx" ON "sus_imports"("status");
CREATE INDEX IF NOT EXISTS "sus_imports_reprocessedFromImportId_idx" ON "sus_imports"("reprocessedFromImportId");
CREATE INDEX IF NOT EXISTS "sus_import_rows_tenantId_importId_idx" ON "sus_import_rows"("tenantId", "importId");
CREATE INDEX IF NOT EXISTS "sus_import_rows_status_idx" ON "sus_import_rows"("status");

DO $$
BEGIN
  ALTER TABLE "sus_imports"
    ADD CONSTRAINT "sus_imports_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "sus_imports"
    ADD CONSTRAINT "sus_imports_reprocessedFromImportId_fkey"
    FOREIGN KEY ("reprocessedFromImportId") REFERENCES "sus_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "sus_import_rows"
    ADD CONSTRAINT "sus_import_rows_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "sus_import_rows"
    ADD CONSTRAINT "sus_import_rows_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "sus_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

