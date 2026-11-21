-- DB-8.1: tabla posicion, una fila por equipo y temporada. La actualiza solo el backend (BE-8.1,
-- recálculo al finalizar un partido); no hay edición manual. Las filas de prueba las calcula BE-8.1
-- sobre los partidos Finalizados que carga DB-1.4.
CREATE TABLE "posicion" (
  "id" SERIAL NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  "equipo_id" INTEGER NOT NULL,
  "pj" INTEGER NOT NULL DEFAULT 0,
  "pg" INTEGER NOT NULL DEFAULT 0,
  "pe" INTEGER NOT NULL DEFAULT 0,
  "pp" INTEGER NOT NULL DEFAULT 0,
  "gf" INTEGER NOT NULL DEFAULT 0,
  "gc" INTEGER NOT NULL DEFAULT 0,
  "dg" INTEGER NOT NULL DEFAULT 0,
  "puntos" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "posicion_pkey" PRIMARY KEY ("id"),
  -- Llave compuesta: el equipo pertenece a esa temporada (y la temporada existe, por equipo).
  CONSTRAINT "posicion_equipo_id_temporada_id_fkey" FOREIGN KEY ("equipo_id", "temporada_id") REFERENCES "equipo"("id", "temporada_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_posicion_no_negativos" CHECK ("pj" >= 0 AND "pg" >= 0 AND "pe" >= 0 AND "pp" >= 0 AND "gf" >= 0 AND "gc" >= 0 AND "puntos" >= 0),
  CONSTRAINT "ck_posicion_pj" CHECK ("pj" = "pg" + "pe" + "pp"),
  -- Las fórmulas de H8: dg = gf - gc y puntos = 3 por ganado + 1 por empatado.
  CONSTRAINT "ck_posicion_dg" CHECK ("dg" = "gf" - "gc"),
  CONSTRAINT "ck_posicion_puntos" CHECK ("puntos" = "pg" * 3 + "pe")
);
CREATE UNIQUE INDEX "posicion_temporada_id_equipo_id_key" ON "posicion"("temporada_id", "equipo_id");
