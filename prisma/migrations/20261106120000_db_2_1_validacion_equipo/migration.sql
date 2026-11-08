-- DB-2.1: trazabilidad de la validacion del equipo.
ALTER TABLE "equipo"
  ADD COLUMN "motivo_rechazo" TEXT,
  ADD COLUMN "validado_por" UUID,
  ADD COLUMN "fecha_validacion" TIMESTAMPTZ(3),
  ADD CONSTRAINT "equipo_validado_por_fkey" FOREIGN KEY ("validado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipo" ADD CONSTRAINT "ck_equipo_validacion" CHECK (
  ("estado" = 'PENDIENTE' AND "validado_por" IS NULL
     AND "fecha_validacion" IS NULL AND "motivo_rechazo" IS NULL)
  OR ("estado" = 'INSCRITO' AND "validado_por" IS NOT NULL
     AND "fecha_validacion" IS NOT NULL AND "motivo_rechazo" IS NULL)
  OR ("estado" = 'RECHAZADO' AND "validado_por" IS NOT NULL
     AND "fecha_validacion" IS NOT NULL
     AND char_length(btrim("motivo_rechazo")) >= 20)
);
