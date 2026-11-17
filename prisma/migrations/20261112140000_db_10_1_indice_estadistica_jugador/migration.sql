-- DB-10.1: índice para consultar las estadísticas de UN jugador (H10). estadistica_partido solo tenía índices
-- con partido_id al frente (la unicidad partido_id + jugador_id), que no sirven para buscar por jugador_id.
-- equipo_jugador ya cubre (temporada_id, jugador_id) y partido ya tiene sus índices: no se agrega nada ahí.
CREATE INDEX "ix_estadistica_jugador" ON "estadistica_partido"("jugador_id");
