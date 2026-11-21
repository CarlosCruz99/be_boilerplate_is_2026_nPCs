-- DB-16.1: la jornada registra quién y cuándo la publicó.
-- Solo depende de DB-3.1 (tabla jornada). La unicidad "un aviso por capitán y jornada"
-- la da UNIQUE (usuario_id, clave_idempotencia) de DB-20.1 y no se repite aquí.
ALTER TABLE "jornada"
  ADD COLUMN "publicada_en" TIMESTAMPTZ(3),
  ADD COLUMN "publicada_por" UUID;

-- Jornadas que ya estaban Publicadas (seed de DB-3.2) no tienen autor ni fecha; sin esto
-- el CHECK de abajo fallaría. Se les asigna el primer organizador y el momento de la migración.
DO $$
DECLARE org UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM "jornada" WHERE "estado" = 'PUBLICADA') THEN
    SELECT "id" INTO org FROM "usuario" WHERE "rol" = 'ORGANIZADOR' ORDER BY "email" LIMIT 1;
    IF org IS NULL THEN
      RAISE EXCEPTION 'Hay jornadas Publicadas y ningun usuario ORGANIZADOR al que atribuirlas. Corre antes el seed de H1.';
    END IF;
    UPDATE "jornada" SET "publicada_en" = now(), "publicada_por" = org WHERE "estado" = 'PUBLICADA';
  END IF;
END $$;

-- RESTRICT: borrar al usuario que publicó dejaría una jornada Publicada sin autor.
ALTER TABLE "jornada"
  ADD CONSTRAINT "jornada_publicada_por_fkey" FOREIGN KEY ("publicada_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_jornada_publicacion" CHECK (
    ("estado" = 'BORRADOR'  AND "publicada_en" IS NULL     AND "publicada_por" IS NULL)
 OR ("estado" = 'PUBLICADA' AND "publicada_en" IS NOT NULL AND "publicada_por" IS NOT NULL)
  );
