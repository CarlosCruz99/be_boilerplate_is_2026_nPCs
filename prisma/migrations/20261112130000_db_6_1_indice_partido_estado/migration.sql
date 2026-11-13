-- DB-6.1: índice de la lista de partidos de H6 (filtro por estado, orden por inicio descendente).
-- No se crea ix_participacion_partido (partido_id): participacion_partido ya tiene como llave primaria
-- (partido_id, jugador_id), y un índice por partido_id solo duplicaría ese mismo recorrido.
CREATE INDEX "ix_partido_estado_inicio" ON "partido"("estado", "inicio" DESC);
