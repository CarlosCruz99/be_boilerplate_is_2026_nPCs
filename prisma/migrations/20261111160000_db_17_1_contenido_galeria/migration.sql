-- DB-17.1: metadatos de la galería de cada partido (H17).
-- El archivo (foto o video) NO se guarda en la base: vive en el almacenamiento local privado del servidor y
-- aquí solo queda su metadato y la clave (storage_key) para encontrarlo. Ver docs/er-h17.md.
CREATE TYPE "tipo_contenido_galeria" AS ENUM ('FOTO', 'VIDEO');
CREATE TYPE "estado_contenido_galeria" AS ENUM ('ACTIVO', 'ELIMINADO');

CREATE TABLE "contenido_galeria" (
  "id" UUID NOT NULL,
  "partido_id" INTEGER NOT NULL,
  "tipo" "tipo_contenido_galeria" NOT NULL,
  "storage_key" VARCHAR(255) NOT NULL,
  "nombre_original" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "tamano_bytes" INTEGER NOT NULL,
  "descripcion" VARCHAR(200),
  "subido_por" UUID NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "estado" "estado_contenido_galeria" NOT NULL DEFAULT 'ACTIVO',
  -- Borrado lógico: quién y cuándo lo eliminó, para no perder trazabilidad.
  "eliminado_en" TIMESTAMPTZ(3),
  "eliminado_por" UUID,
  CONSTRAINT "contenido_galeria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contenido_galeria_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contenido_galeria_subido_por_fkey" FOREIGN KEY ("subido_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contenido_galeria_eliminado_por_fkey" FOREIGN KEY ("eliminado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_galeria_texto" CHECK (char_length(btrim("storage_key")) > 0 AND char_length(btrim("nombre_original")) > 0),
  CONSTRAINT "ck_galeria_descripcion" CHECK ("descripcion" IS NULL OR char_length("descripcion") <= 200),
  -- Formatos de H17: foto JPG/JPEG o PNG; video MP4.
  CONSTRAINT "ck_galeria_mime" CHECK (
    ("tipo" = 'FOTO'  AND "mime_type" IN ('image/jpeg', 'image/png'))
 OR ("tipo" = 'VIDEO' AND "mime_type" = 'video/mp4')
  ),
  -- Tamaño positivo y límites exactos: 5 MiB para fotos y 50 MiB para videos (el backend valida lo mismo).
  CONSTRAINT "ck_galeria_tamano" CHECK (
    ("tipo" = 'FOTO'  AND "tamano_bytes" BETWEEN 1 AND 5242880)
 OR ("tipo" = 'VIDEO' AND "tamano_bytes" BETWEEN 1 AND 52428800)
  ),
  CONSTRAINT "ck_galeria_eliminacion" CHECK (
    ("estado" = 'ACTIVO'    AND "eliminado_en" IS NULL     AND "eliminado_por" IS NULL)
 OR ("estado" = 'ELIMINADO' AND "eliminado_en" IS NOT NULL AND "eliminado_por" IS NOT NULL)
  )
);
-- Una clave de almacenamiento pertenece a un solo registro (borrar un archivo no afecta a otro).
CREATE UNIQUE INDEX "contenido_galeria_storage_key_key" ON "contenido_galeria"("storage_key");
-- Ordenar y paginar la galería: más reciente primero, con el id como desempate estable.
CREATE INDEX "ix_galeria_partido_fecha" ON "contenido_galeria"("partido_id", "creado_en" DESC, "id" DESC);
-- Contar los activos de un partido (límite de 30) sin leer los eliminados.
CREATE INDEX "ix_galeria_activos" ON "contenido_galeria"("partido_id") WHERE "estado" = 'ACTIVO';

-- Límite de 30 archivos activos por partido, también bajo concurrencia. El trigger bloquea la fila del partido
-- (FOR NO KEY UPDATE) antes de contar, así dos subidas simultáneas se turnan y la segunda ve a la primera.
-- BE-17.1 puede bloquear el partido antes: es el mismo bloqueo dentro de su transacción.
-- Si el partido no existe se deja pasar: la llave foránea responde "no existe" (23503).
CREATE FUNCTION "fn_galeria_limite_activos"() RETURNS trigger AS $$
DECLARE
  v_activos INTEGER;
BEGIN
  PERFORM 1 FROM "partido" WHERE "id" = NEW."partido_id" FOR NO KEY UPDATE;
  IF FOUND THEN
    SELECT count(*) INTO v_activos FROM "contenido_galeria"
     WHERE "partido_id" = NEW."partido_id" AND "estado" = 'ACTIVO' AND "id" IS DISTINCT FROM NEW."id";
    IF v_activos >= 30 THEN
      RAISE EXCEPTION 'El partido % ya tiene 30 archivos activos en la galeria', NEW."partido_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "tr_galeria_limite_activos"
  BEFORE INSERT OR UPDATE OF "estado", "partido_id" ON "contenido_galeria"
  FOR EACH ROW WHEN (NEW."estado" = 'ACTIVO')
  EXECUTE FUNCTION "fn_galeria_limite_activos"();
