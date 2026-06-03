-- Patient SUS auto-merge fields and CPF identity hardening

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "praemId" TEXT,
  ADD COLUMN IF NOT EXISTS "qrHash" TEXT,
  ADD COLUMN IF NOT EXISTS "qrCodeUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "lastTransportDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "specialRequirements" TEXT,
  ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT,
  ADD COLUMN IF NOT EXISTS "recurringPatient" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Patient_cpf_key" ON "Patient"("cpf");
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_praemId_key" ON "Patient"("praemId");
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_qrHash_key" ON "Patient"("qrHash");
