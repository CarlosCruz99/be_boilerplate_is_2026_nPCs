-- Revierte DB-9.1. Se pierden las estadísticas por jugador; no se toca ninguna otra tabla.
DROP TRIGGER IF EXISTS "tr_estadistica_jugador_del_partido" ON "estadistica_partido";
DROP FUNCTION IF EXISTS "fn_estadistica_jugador_del_partido"();
DROP TABLE IF EXISTS "estadistica_partido";
