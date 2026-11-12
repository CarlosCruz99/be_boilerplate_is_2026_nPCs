-- Reversión de DB-24.1. Se pierde quién y cuándo decidió y el motivo de rechazo; los estados se conservan.
DROP INDEX IF EXISTS "ix_pago_pendientes";
ALTER TABLE "pago"
  DROP CONSTRAINT IF EXISTS "ck_pago_decision",
  DROP CONSTRAINT IF EXISTS "pago_verificado_por_fkey",
  DROP COLUMN IF EXISTS "motivo_rechazo",
  DROP COLUMN IF EXISTS "verificado_en",
  DROP COLUMN IF EXISTS "verificado_por";
