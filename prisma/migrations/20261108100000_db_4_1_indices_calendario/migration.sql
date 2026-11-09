-- DB-4.1: índices de consulta del calendario por equipo y por jornada (H4 y H3).
-- Las restricciones de exclusión de DB-3.1 ya indexan cancha y árbitro por horario,
-- pero ninguna sirve para buscar los partidos de un equipo.
-- El documento usa la columna "jornada"; en este modelo es "jornada_id" (llave a jornada).

-- Partidos de un equipo como local, ordenados por fecha.
CREATE INDEX "ix_partido_local_inicio" ON "partido"("equipo_local_id", "inicio");
-- Partidos de un equipo como visitante, ordenados por fecha.
CREATE INDEX "ix_partido_visitante_inicio" ON "partido"("equipo_visitante_id", "inicio");
-- Partidos de una jornada de una temporada (listado del organizador, H3).
CREATE INDEX "ix_partido_temporada_jornada" ON "partido"("temporada_id", "jornada_id");
