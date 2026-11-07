-- DB-1.1: temporada, equipo, jugador y equipo_jugador.
CREATE TYPE "estado_equipo" AS ENUM ('PENDIENTE', 'INSCRITO', 'RECHAZADO');

CREATE TABLE "temporada" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "fecha_inicio" DATE NOT NULL,
  "fecha_fin" DATE NOT NULL,
  "max_equipos" SMALLINT NOT NULL DEFAULT 12,
  "inscripcion_abierta" BOOLEAN NOT NULL DEFAULT true,
  "actual" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "temporada_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_temporada_max_equipos" CHECK ("max_equipos" >= 2),
  CONSTRAINT "ck_temporada_fechas" CHECK ("fecha_fin" >= "fecha_inicio")
);
CREATE UNIQUE INDEX "temporada_nombre_key" ON "temporada"("nombre");
-- Indice parcial: a lo mucho una temporada con actual = TRUE (Prisma no lo expresa).
CREATE UNIQUE INDEX "ux_temporada_actual" ON "temporada"("actual") WHERE "actual";

CREATE TABLE "equipo" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(50) NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  "capitan_id" UUID NOT NULL,
  "estado" "estado_equipo" NOT NULL DEFAULT 'PENDIENTE',
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "equipo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "equipo_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipo_capitan_id_fkey" FOREIGN KEY ("capitan_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "equipo_id_temporada_id_key" ON "equipo"("id", "temporada_id");
CREATE UNIQUE INDEX "equipo_temporada_id_capitan_id_key" ON "equipo"("temporada_id", "capitan_id");
-- Nombre unico por temporada sin distinguir mayusculas (indice con lower(): a mano).
CREATE UNIQUE INDEX "uq_equipo_nombre_temporada" ON "equipo"("temporada_id", lower("nombre"));
CREATE INDEX "ix_equipo_temporada_estado" ON "equipo"("temporada_id", "estado");

CREATE TABLE "jugador" (
  "id" SERIAL NOT NULL,
  "nombre_completo" VARCHAR(120) NOT NULL,
  "fecha_nacimiento" DATE NOT NULL,
  "identificacion" VARCHAR(20) NOT NULL,
  "foto_url" TEXT NOT NULL,
  "usuario_id" UUID,
  CONSTRAINT "jugador_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jugador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "jugador_identificacion_key" ON "jugador"("identificacion");
CREATE UNIQUE INDEX "jugador_usuario_id_key" ON "jugador"("usuario_id");

CREATE TABLE "equipo_jugador" (
  "equipo_id" INTEGER NOT NULL,
  "jugador_id" INTEGER NOT NULL,
  "temporada_id" INTEGER NOT NULL,
  CONSTRAINT "equipo_jugador_pkey" PRIMARY KEY ("equipo_id", "jugador_id"),
  CONSTRAINT "equipo_jugador_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "jugador"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "equipo_jugador_equipo_id_temporada_id_fkey" FOREIGN KEY ("equipo_id", "temporada_id") REFERENCES "equipo"("id", "temporada_id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Un jugador, un equipo por temporada.
CREATE UNIQUE INDEX "equipo_jugador_temporada_id_jugador_id_key" ON "equipo_jugador"("temporada_id", "jugador_id");
CREATE INDEX "ix_equipo_jugador_equipo" ON "equipo_jugador"("equipo_id");
