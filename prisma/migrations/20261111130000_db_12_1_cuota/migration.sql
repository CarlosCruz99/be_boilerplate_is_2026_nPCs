-- DB-12.1: cuotas de inscripción y de arbitraje (H12). Sin tocar tablas de otros módulos.
-- La validación de equipo inscrito y de participación en el partido, y el rechazo de más de dos
-- decimales, son de BE-12.1: NUMERIC(12,2) redondea en silencio (10.005 se guarda como 10.01).
CREATE TYPE "concepto_cuota" AS ENUM ('INSCRIPCION', 'ARBITRAJE');

CREATE TABLE "cuota" (
  "id" SERIAL NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  "equipo_id" INTEGER NOT NULL,
  "concepto" "concepto_cuota" NOT NULL,
  "partido_id" INTEGER,
  "monto" NUMERIC(12,2) NOT NULL,
  "fecha_vencimiento" DATE NOT NULL,
  "creado_por" UUID NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "cuota_pkey" PRIMARY KEY ("id"),
  -- El equipo pertenece a esa temporada (y la temporada existe, por equipo).
  CONSTRAINT "cuota_equipo_id_temporada_id_fkey" FOREIGN KEY ("equipo_id", "temporada_id") REFERENCES "equipo"("id", "temporada_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cuota_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cuota_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_cuota_monto" CHECK ("monto" > 0),
  -- Solo el arbitraje lleva partido, y lo exige.
  CONSTRAINT "ck_cuota_partido" CHECK (
    ("concepto" = 'INSCRIPCION' AND "partido_id" IS NULL)
 OR ("concepto" = 'ARBITRAJE'   AND "partido_id" IS NOT NULL)
  )
);
-- Sin duplicados, incluso con solicitudes simultáneas: la base rechaza la segunda.
CREATE UNIQUE INDEX "uq_cuota_inscripcion" ON "cuota"("temporada_id", "equipo_id") WHERE "concepto" = 'INSCRIPCION';
CREATE UNIQUE INDEX "uq_cuota_arbitraje" ON "cuota"("partido_id", "equipo_id") WHERE "concepto" = 'ARBITRAJE';
