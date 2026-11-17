-- Solo se puede revertir DB-24.1 si todos los pagos están PENDIENTE.
BEGIN;

-- Impide que otro proceso registre o decida pagos entre la comprobación y la reversión.
LOCK TABLE "pago" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "pago" WHERE "estado" IN ('VERIFICADO', 'RECHAZADO')) THEN
    RAISE EXCEPTION 'No se puede revertir DB-24.1: hay pagos VERIFICADO o RECHAZADO. Todos los pagos deben estar PENDIENTE.';
  END IF;
END $$;

DROP INDEX IF EXISTS "ix_pago_pendientes";
ALTER TABLE "pago"
  DROP CONSTRAINT IF EXISTS "ck_pago_decision",
  DROP CONSTRAINT IF EXISTS "pago_verificado_por_fkey",
  DROP COLUMN IF EXISTS "motivo_rechazo",
  DROP COLUMN IF EXISTS "verificado_en",
  DROP COLUMN IF EXISTS "verificado_por";

COMMIT;
