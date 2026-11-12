-- DB-23.1: auditoría de correcciones de resultados oficiales (H23). Una fila por corrección confirmada,
-- guardada por el backend en la MISMA transacción que la corrección: si esa transacción se revierte, la fila
-- tampoco queda. La aplicación no edita ni borra filas; el borrado físico solo ocurre al revertir la migración.
CREATE TABLE "correccion_partido" (
  "id" SERIAL NOT NULL,
  "partido_id" INTEGER NOT NULL,
  "usuario_id" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "antes" JSONB NOT NULL,
  "despues" JSONB NOT NULL,
  "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "correccion_partido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "correccion_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "correccion_partido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_correccion_motivo" CHECK (char_length(btrim("motivo")) >= 20),
  -- Instantáneas del resultado: objetos JSON (no null, números ni listas) y distintas entre sí.
  CONSTRAINT "ck_correccion_antes" CHECK (jsonb_typeof("antes") = 'object'),
  CONSTRAINT "ck_correccion_despues" CHECK (jsonb_typeof("despues") = 'object'),
  CONSTRAINT "ck_correccion_cambia" CHECK ("antes" <> "despues")
);
CREATE INDEX "ix_correccion_partido" ON "correccion_partido"("partido_id", "fecha" DESC);

-- Solo se inserta: una fila de auditoría no se edita ni se borra. (TRUNCATE y DROP TABLE, usados al revertir la
-- migración o reiniciar la base, no pasan por este trigger.)
CREATE FUNCTION "fn_correccion_partido_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'correccion_partido es solo de insercion: no se permite % sobre filas de auditoria', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "tr_correccion_partido_inmutable"
  BEFORE UPDATE OR DELETE ON "correccion_partido"
  FOR EACH ROW EXECUTE FUNCTION "fn_correccion_partido_inmutable"();
