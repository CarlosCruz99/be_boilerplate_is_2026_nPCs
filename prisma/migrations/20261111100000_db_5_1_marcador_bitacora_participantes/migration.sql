-- DB-5.1: marcador, faltas y tiempos reales en partido; bitácora del marcador y participantes.
-- Escrita a mano: Prisma no expresa los CHECK ni los triggers. No recrea partido, equipo ni temporada.
-- La fuente oficial del marcador por equipo y de las faltas es partido; los goles, asistencias y
-- tarjetas por jugador viven solo en estadistica_partido (DB-9.1).
ALTER TABLE "partido"
  ADD COLUMN "goles_local" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "goles_visitante" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "faltas_local" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "faltas_visitante" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inicio_real" TIMESTAMPTZ(3),
  ADD COLUMN "fin_real" TIMESTAMPTZ(3);

-- Partidos que ya estaban En curso o Finalizados (sin tiempos reales) tomarían el CHECK de abajo
-- como inválido; se les asigna el horario programado como tiempo real.
UPDATE "partido" SET "inicio_real" = "inicio" WHERE "estado" IN ('EN_CURSO', 'FINALIZADO');
UPDATE "partido" SET "fin_real" = "fin" WHERE "estado" = 'FINALIZADO';

ALTER TABLE "partido"
  ADD CONSTRAINT "ck_partido_goles_local" CHECK ("goles_local" BETWEEN 0 AND 99),
  ADD CONSTRAINT "ck_partido_goles_visitante" CHECK ("goles_visitante" BETWEEN 0 AND 99),
  ADD CONSTRAINT "ck_partido_faltas_local" CHECK ("faltas_local" BETWEEN 0 AND 99),
  ADD CONSTRAINT "ck_partido_faltas_visitante" CHECK ("faltas_visitante" BETWEEN 0 AND 99),
  ADD CONSTRAINT "ck_partido_tiempos" CHECK (
    ("estado" IN ('PROGRAMADO', 'CANCELADO') AND "inicio_real" IS NULL AND "fin_real" IS NULL)
 OR ("estado" = 'EN_CURSO'   AND "inicio_real" IS NOT NULL AND "fin_real" IS NULL)
 OR ("estado" = 'FINALIZADO' AND "inicio_real" IS NOT NULL AND "fin_real" IS NOT NULL AND "fin_real" >= "inicio_real")
  );

-- Cada cambio del marcador queda registrado: quién, qué valores y con qué acción.
CREATE TABLE "bitacora_marcador" (
  "id" SERIAL NOT NULL,
  "partido_id" INTEGER NOT NULL,
  "usuario_id" UUID NOT NULL,
  "goles_local" INTEGER NOT NULL,
  "goles_visitante" INTEGER NOT NULL,
  "faltas_local" INTEGER NOT NULL,
  "faltas_visitante" INTEGER NOT NULL,
  "accion" VARCHAR(10) NOT NULL,
  "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "bitacora_marcador_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bitacora_marcador_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bitacora_marcador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_bitacora_accion" CHECK ("accion" IN ('INICIAR', 'ACTUALIZAR', 'FINALIZAR')),
  -- Una fila de bitácora es una foto del marcador: no puede tener valores que partido no admitiría.
  CONSTRAINT "ck_bitacora_valores" CHECK (
    "goles_local" BETWEEN 0 AND 99 AND "goles_visitante" BETWEEN 0 AND 99
    AND "faltas_local" BETWEEN 0 AND 99 AND "faltas_visitante" BETWEEN 0 AND 99)
);
CREATE INDEX "ix_bitacora_partido" ON "bitacora_marcador"("partido_id");

-- Jugadores que participaron en un partido, con el equipo por el que jugaron.
CREATE TABLE "participacion_partido" (
  "partido_id" INTEGER NOT NULL,
  "jugador_id" INTEGER NOT NULL,
  "equipo_id" INTEGER NOT NULL,
  CONSTRAINT "participacion_partido_pkey" PRIMARY KEY ("partido_id", "jugador_id"),
  CONSTRAINT "participacion_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- El jugador debe pertenecer a ese equipo (equipo_jugador).
  CONSTRAINT "participacion_partido_equipo_id_jugador_id_fkey" FOREIGN KEY ("equipo_id", "jugador_id") REFERENCES "equipo_jugador"("equipo_id", "jugador_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Además de pertenecer a un equipo, ese equipo debe ser uno de los dos que juegan el partido
-- (la llave foránea sola dejaría registrar a un jugador de un equipo ajeno al partido).
CREATE FUNCTION "fn_participacion_equipo_del_partido"() RETURNS trigger AS $$
BEGIN
  -- Si el partido no existe se deja pasar: la llave foránea responde "no existe" (23503).
  IF EXISTS (SELECT 1 FROM "partido" WHERE "id" = NEW."partido_id") AND NOT EXISTS (
    SELECT 1 FROM "partido" p
    WHERE p."id" = NEW."partido_id" AND NEW."equipo_id" IN (p."equipo_local_id", p."equipo_visitante_id")
  ) THEN
    RAISE EXCEPTION 'El equipo % no juega el partido %', NEW."equipo_id", NEW."partido_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "tr_participacion_equipo_del_partido"
  BEFORE INSERT OR UPDATE OF "partido_id", "equipo_id" ON "participacion_partido"
  FOR EACH ROW EXECUTE FUNCTION "fn_participacion_equipo_del_partido"();
