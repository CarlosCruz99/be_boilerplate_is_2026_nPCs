-- Verifica el dato de prueba de DB-9.1 (cargado por npm run db:seed): partido 12, goles 1, asistencias 0, tarjetas 1.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h9-seed.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- La sentencia DEBE fallar con el SQLSTATE indicado: 23514 check, 23503 FK, 23505 unico.
-- 23503 tambien acepta 23001 (restrict_violation): Postgres reciente lo usa para ON DELETE RESTRICT.
CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo OR (codigo = '23503' AND SQLSTATE = '23001') THEN RAISE NOTICE 'OK    % (rechazado: %)', caso, SQLSTATE; RETURN; END IF;
    RAISE EXCEPTION 'FALLO %: fallo por otro motivo (%): %', caso, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO %: la sentencia NO fue rechazada', caso;
END $$ LANGUAGE plpgsql;

-- Ejecuta una sentencia que SI debe funcionar y devuelve las filas afectadas.
CREATE FUNCTION pg_temp.filas(sentencia text) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN EXECUTE sentencia; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$ LANGUAGE plpgsql;

SELECT p.id AS p12, p.equipo_local_id AS loc, p.temporada_id AS t FROM partido p JOIN temporada t ON t.id=p.temporada_id
 WHERE t.nombre='Apertura 2026' ORDER BY p.id OFFSET 11 LIMIT 1 \gset
SELECT pg_temp.esperar('hay un registro de prueba en el partido 12', (SELECT count(*) FROM estadistica_partido WHERE partido_id=:p12), 1);
SELECT pg_temp.esperar('goles = 1, asistencias = 0, tarjetas = 1', (SELECT count(*) FROM estadistica_partido WHERE partido_id=:p12 AND goles=1 AND asistencias=0 AND tarjetas=1), 1);
SELECT pg_temp.esperar('el jugador esta inscrito en el equipo local del partido', (SELECT count(*) FROM estadistica_partido e
  JOIN equipo_jugador ej ON ej.jugador_id=e.jugador_id AND ej.equipo_id=:loc AND ej.temporada_id=:t WHERE e.partido_id=:p12), 1);
\echo 'Seed de estadisticas verificado.'
