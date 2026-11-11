-- Revierte DB-5.1. Se pierden marcadores, faltas, tiempos reales, bitácora y participantes.
-- Los partidos, sus estados y su programación no se tocan.
DROP TRIGGER IF EXISTS "tr_participacion_equipo_del_partido" ON "participacion_partido";
DROP FUNCTION IF EXISTS "fn_participacion_equipo_del_partido"();
DROP TABLE IF EXISTS "participacion_partido";
DROP TABLE IF EXISTS "bitacora_marcador";
ALTER TABLE "partido"
  DROP CONSTRAINT IF EXISTS "ck_partido_tiempos",
  DROP CONSTRAINT IF EXISTS "ck_partido_faltas_visitante",
  DROP CONSTRAINT IF EXISTS "ck_partido_faltas_local",
  DROP CONSTRAINT IF EXISTS "ck_partido_goles_visitante",
  DROP CONSTRAINT IF EXISTS "ck_partido_goles_local",
  DROP COLUMN IF EXISTS "fin_real",
  DROP COLUMN IF EXISTS "inicio_real",
  DROP COLUMN IF EXISTS "faltas_visitante",
  DROP COLUMN IF EXISTS "faltas_local",
  DROP COLUMN IF EXISTS "goles_visitante",
  DROP COLUMN IF EXISTS "goles_local";
