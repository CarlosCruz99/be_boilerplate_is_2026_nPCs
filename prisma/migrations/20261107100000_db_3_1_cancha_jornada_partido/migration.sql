-- DB-3.1: cancha, jornada y partido con restricciones contra choques de cancha,
-- de árbitro y cruces repetidos. Escrita a mano: Prisma no expresa las
-- restricciones de exclusión, el índice parcial ni el índice con expresión.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "estado_partido" AS ENUM ('PROGRAMADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO');
CREATE TYPE "estado_jornada" AS ENUM ('BORRADOR', 'PUBLICADA');

CREATE TABLE "cancha" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "direccion" VARCHAR(200) NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "cancha_pkey" PRIMARY KEY ("id")
);
-- "Cancha 1" y "CANCHA 1" no pueden coexistir.
CREATE UNIQUE INDEX "uq_cancha_nombre" ON "cancha"(lower("nombre"));

CREATE TABLE "jornada" (
  "id" SERIAL NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  "numero" SMALLINT NOT NULL,
  "estado" "estado_jornada" NOT NULL DEFAULT 'BORRADOR',
  CONSTRAINT "jornada_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_jornada_numero" CHECK ("numero" >= 1),
  CONSTRAINT "jornada_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "jornada_temporada_id_numero_key" ON "jornada"("temporada_id", "numero");
CREATE UNIQUE INDEX "jornada_id_temporada_id_key" ON "jornada"("id", "temporada_id");

CREATE TABLE "partido" (
  "id" SERIAL NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  "jornada_id" INTEGER NOT NULL,
  "equipo_local_id" INTEGER NOT NULL,
  "equipo_visitante_id" INTEGER NOT NULL,
  "cancha_id" INTEGER NOT NULL,
  "arbitro_id" UUID NOT NULL,
  "inicio" TIMESTAMPTZ(3) NOT NULL,
  "fin" TIMESTAMPTZ(3) NOT NULL,
  "estado" "estado_partido" NOT NULL DEFAULT 'PROGRAMADO',
  CONSTRAINT "partido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partido_cancha_id_fkey" FOREIGN KEY ("cancha_id") REFERENCES "cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partido_arbitro_id_fkey" FOREIGN KEY ("arbitro_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Llaves compuestas: jornada y equipos pertenecen a la temporada del partido.
  CONSTRAINT "partido_jornada_id_temporada_id_fkey" FOREIGN KEY ("jornada_id", "temporada_id") REFERENCES "jornada"("id", "temporada_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partido_equipo_local_id_temporada_id_fkey" FOREIGN KEY ("equipo_local_id", "temporada_id") REFERENCES "equipo"("id", "temporada_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partido_equipo_visitante_id_temporada_id_fkey" FOREIGN KEY ("equipo_visitante_id", "temporada_id") REFERENCES "equipo"("id", "temporada_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_partido_equipos_distintos" CHECK ("equipo_local_id" <> "equipo_visitante_id"),
  CONSTRAINT "ck_partido_duracion" CHECK ("fin" - "inicio" = interval '90 minutes'),
  -- tstzrange es semiabierto: dos partidos consecutivos (09:30 y 09:30) son válidos.
  CONSTRAINT "ex_partido_cancha" EXCLUDE USING gist ("cancha_id" WITH =, tstzrange("inicio", "fin") WITH &&) WHERE ("estado" <> 'CANCELADO'),
  CONSTRAINT "ex_partido_arbitro" EXCLUDE USING gist ("arbitro_id" WITH =, tstzrange("inicio", "fin") WITH &&) WHERE ("estado" <> 'CANCELADO')
);
-- Un par de equipos se enfrenta una sola vez (A vs B = B vs A); un Cancelado libera el cruce.
CREATE UNIQUE INDEX "uq_partido_cruce_temporada" ON "partido"(
  "temporada_id", LEAST("equipo_local_id", "equipo_visitante_id"), GREATEST("equipo_local_id", "equipo_visitante_id")
) WHERE "estado" <> 'CANCELADO';
