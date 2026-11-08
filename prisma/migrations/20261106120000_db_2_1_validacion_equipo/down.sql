ALTER TABLE "equipo"
  DROP CONSTRAINT "ck_equipo_validacion",
  DROP CONSTRAINT "equipo_validado_por_fkey",
  DROP COLUMN "fecha_validacion",
  DROP COLUMN "validado_por",
  DROP COLUMN "motivo_rechazo";
