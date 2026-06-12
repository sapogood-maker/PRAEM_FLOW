-- Remove temporary unique constraints from Patient identity fields.
-- Safe for legacy duplicate/null values already present in production.

DROP INDEX IF EXISTS "Patient_cpf_key";
DROP INDEX IF EXISTS "Patient_praemId_key";
DROP INDEX IF EXISTS "Patient_qrHash_key";
