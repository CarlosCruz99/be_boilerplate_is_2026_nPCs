-- DB-24.1: decisión de verificación de pagos (H24) sobre la tabla pago de DB-13.1. No se crea otra
-- tabla: quién decidió, cuándo y el motivo del rechazo viven en la misma fila del pago.
-- Un pago solo puede quedar VERIFICADO o RECHAZADO con datos de decisión completos, y PENDIENTE sin ellos.

-- Los pagos que ya existan deben cumplir la regla nueva. Hasta H24 nada resolvía pagos, así que lo normal es
-- que todos sigan PENDIENTES; si hay alguno resuelto "a mano" no se puede inventar quién y cuándo lo decidió.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM "pago" WHERE "estado" <> 'PENDIENTE';
  IF n > 0 THEN
    RAISE EXCEPTION 'DB-24.1: hay % pagos VERIFICADO/RECHAZADO sin datos de decision; resuelvalos o regresalos a PENDIENTE antes de migrar', n;
  END IF;
END $$;

ALTER TABLE "pago"
  ADD COLUMN "verificado_por" UUID,
  ADD COLUMN "verificado_en" TIMESTAMPTZ(3),
  ADD COLUMN "motivo_rechazo" TEXT,
  ADD CONSTRAINT "pago_verificado_por_fkey" FOREIGN KEY ("verificado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_pago_decision" CHECK (
       ("estado" = 'PENDIENTE'  AND "verificado_por" IS NULL     AND "verificado_en" IS NULL     AND "motivo_rechazo" IS NULL)
    OR ("estado" = 'VERIFICADO' AND "verificado_por" IS NOT NULL AND "verificado_en" IS NOT NULL AND "motivo_rechazo" IS NULL)
    OR ("estado" = 'RECHAZADO'  AND "verificado_por" IS NOT NULL AND "verificado_en" IS NOT NULL
        AND "motivo_rechazo" IS NOT NULL AND char_length(btrim("motivo_rechazo")) >= 20)
  );

-- Bandeja de pendientes del organizador (más antiguos primero): índice parcial, solo pesa lo que está sin resolver.
CREATE INDEX "ix_pago_pendientes" ON "pago"("creado_en", "id") WHERE "estado" = 'PENDIENTE';
