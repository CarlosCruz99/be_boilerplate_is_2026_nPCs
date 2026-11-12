-- DB-9.1: estadísticas individuales por jugador y partido.
-- Esta tabla es la ÚNICA fuente de goles, asistencias y tarjetas por jugador (la usan H6, H9, H10, H11 y H22).
-- No recrea jugador, equipo, temporada ni partido. Las llaves foráneas son INTEGER.
-- La temporada y la oficialidad NO se guardan aquí: se derivan del partido (temporada_id y estado = 'FINALIZADO').
CREATE TABLE "estadistica_partido" (
  "id" SERIAL NOT NULL,
  "partido_id" INTEGER NOT NULL,
  "jugador_id" INTEGER NOT NULL,
  "goles" INTEGER NOT NULL DEFAULT 0,
  "asistencias" INTEGER NOT NULL DEFAULT 0,
  "tarjetas" INTEGER NOT NULL DEFAULT 0,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "estadistica_partido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "estadistica_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "estadistica_partido_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "jugador"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_estadistica_goles" CHECK ("goles" >= 0),
  CONSTRAINT "ck_estadistica_asistencias" CHECK ("asistencias" >= 0),
  CONSTRAINT "ck_estadistica_tarjetas" CHECK ("tarjetas" >= 0)
);
-- Un registro por jugador y partido; el upsert del backend se apoya en este índice.
CREATE UNIQUE INDEX "estadistica_partido_partido_id_jugador_id_key" ON "estadistica_partido"("partido_id", "jugador_id");

-- El jugador debe estar inscrito (equipo_jugador, en la temporada del partido) en uno de los dos equipos
-- que juegan ese partido. Las llaves foráneas solas dejarían registrar goles a cualquier jugador.
-- Si el partido o el jugador no existen se deja pasar: la llave foránea responde "no existe" (23503).
CREATE FUNCTION "fn_estadistica_jugador_del_partido"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partido" WHERE "id" = NEW."partido_id")
     AND EXISTS (SELECT 1 FROM "jugador" WHERE "id" = NEW."jugador_id")
     AND NOT EXISTS (
       SELECT 1 FROM "partido" p
       JOIN "equipo_jugador" ej ON ej."jugador_id" = NEW."jugador_id"
        AND ej."temporada_id" = p."temporada_id"
        AND ej."equipo_id" IN (p."equipo_local_id", p."equipo_visitante_id")
       WHERE p."id" = NEW."partido_id")
  THEN
    RAISE EXCEPTION 'El jugador % no esta inscrito en ninguno de los equipos del partido %', NEW."jugador_id", NEW."partido_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "tr_estadistica_jugador_del_partido"
  BEFORE INSERT OR UPDATE OF "partido_id", "jugador_id" ON "estadistica_partido"
  FOR EACH ROW EXECUTE FUNCTION "fn_estadistica_jugador_del_partido"();
