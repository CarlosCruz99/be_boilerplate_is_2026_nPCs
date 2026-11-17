-- Reversión de DB-24.1. Deja la base en un estado desde el que la migración se puede volver a aplicar.
--
-- La migración exige que ningún pago esté VERIFICADO/RECHAZADO sin datos de decisión, y al quitar las columnas
-- esos datos se pierden. Por eso, antes de quitarlas:
--   * los pagos RECHAZADO se eliminan (no cuentan para el saldo y su motivo se pierde con las columnas;
--     devolverlos a PENDIENTE podría superar el monto de la cuota y lo rechazaría el trigger de tope);
--   * los pagos VERIFICADO vuelven a PENDIENTE (el dinero sigue reservado en la cuota; solo se pierde la confirmación).
-- Esto cambia datos: úsese solo en desarrollo o con respaldo.
DO $$
DECLARE rechazados INTEGER; verificados INTEGER;
BEGIN
  DELETE FROM "pago" WHERE "estado" = 'RECHAZADO';
  GET DIAGNOSTICS rechazados = ROW_COUNT;
  UPDATE "pago" SET "estado" = 'PENDIENTE', "verificado_por" = NULL, "verificado_en" = NULL, "motivo_rechazo" = NULL
   WHERE "estado" = 'VERIFICADO';
  GET DIAGNOSTICS verificados = ROW_COUNT;
  RAISE NOTICE 'DB-24.1 down: % pagos rechazados eliminados, % pagos verificados devueltos a PENDIENTE', rechazados, verificados;
END $$;

DROP INDEX IF EXISTS "ix_pago_pendientes";
ALTER TABLE "pago"
  DROP CONSTRAINT IF EXISTS "ck_pago_decision",
  DROP CONSTRAINT IF EXISTS "pago_verificado_por_fkey",
  DROP COLUMN IF EXISTS "motivo_rechazo",
  DROP COLUMN IF EXISTS "verificado_en",
  DROP COLUMN IF EXISTS "verificado_por";
