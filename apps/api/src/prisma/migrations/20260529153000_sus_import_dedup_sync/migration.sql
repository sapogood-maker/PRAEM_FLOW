ALTER TABLE "Patient"
ADD COLUMN "susCard" TEXT;

CREATE UNIQUE INDEX "Patient_tenantId_susCard_key"
ON "Patient"("tenantId", "susCard");

CREATE TABLE "import_history" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "importDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordsRead" INTEGER NOT NULL DEFAULT 0,
  "recordsCreated" INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
  "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_history_tenantId_importDate_idx"
ON "import_history"("tenantId", "importDate");

CREATE INDEX "import_history_tenantId_fileHash_idx"
ON "import_history"("tenantId", "fileHash");

ALTER TABLE "import_history"
ADD CONSTRAINT "import_history_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
