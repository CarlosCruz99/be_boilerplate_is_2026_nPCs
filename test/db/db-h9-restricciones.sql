-- Verifica DB-9.1: tabla estadistica_partido. Requiere los seeds de H1 y DB-3.2.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h9-restricciones.sql
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

SELECT pg_temp.esperar('tabla estadistica_partido creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='estadistica_partido'), 1);
SELECT pg_temp.esperar('claves foraneas INTEGER', (SELECT count(*) FROM information_schema.columns WHERE table_name='estadistica_partido'
  AND column_name IN ('partido_id','jugador_id') AND data_type='integer'), 2);

BEGIN;
SELECT id AS p, temporada_id AS t, equipo_local_id AS loc, equipo_visitante_id AS vis FROM partido WHERE estado='PROGRAMADO' ORDER BY id LIMIT 1 \gset
SELECT jugador_id AS jloc FROM equipo_jugador WHERE equipo_id=:loc ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jvis FROM equipo_jugador WHERE equipo_id=:vis ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jajeno FROM equipo_jugador WHERE equipo_id NOT IN (:loc,:vis) ORDER BY equipo_id, jugador_id LIMIT 1 \gset

SELECT pg_temp.esperar('registro con valores por defecto (todo en cero)', pg_temp.filas(format('INSERT INTO estadistica_partido(partido_id,jugador_id) VALUES (%s,%s)', :p, :jloc)), 1);
SELECT pg_temp.esperar('los tres contadores nacen en 0', (SELECT count(*) FROM estadistica_partido WHERE jugador_id=:jloc AND goles=0 AND asistencias=0 AND tarjetas=0), 1);
SELECT pg_temp.esperar('jugador del equipo visitante', pg_temp.filas(format('INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES (%s,%s,1,0,1)', :p, :jvis)), 1);

SELECT pg_temp.debe_fallar('segundo registro del mismo jugador y partido', format('INSERT INTO estadistica_partido(partido_id,jugador_id) VALUES (%s,%s)', :p, :jloc), '23505');
SELECT pg_temp.debe_fallar('goles negativos', format('UPDATE estadistica_partido SET goles=-1 WHERE jugador_id=%s', :jloc), '23514');
SELECT pg_temp.debe_fallar('asistencias negativas', format('UPDATE estadistica_partido SET asistencias=-1 WHERE jugador_id=%s', :jloc), '23514');
SELECT pg_temp.debe_fallar('tarjetas negativas', format('UPDATE estadistica_partido SET tarjetas=-1 WHERE jugador_id=%s', :jloc), '23514');
SELECT pg_temp.debe_fallar('partido inexistente', format('INSERT INTO estadistica_partido(partido_id,jugador_id) VALUES (0,%s)', :jloc), '23503');
SELECT pg_temp.debe_fallar('jugador inexistente', format('INSERT INTO estadistica_partido(partido_id,jugador_id) VALUES (%s,0)', :p), '23503');
SELECT pg_temp.debe_fallar('jugador inscrito en un equipo que no juega el partido', format('INSERT INTO estadistica_partido(partido_id,jugador_id) VALUES (%s,%s)', :p, :jajeno), '23514');
SELECT pg_temp.debe_fallar('mover un registro a un jugador ajeno al partido', format('UPDATE estadistica_partido SET jugador_id=%s WHERE jugador_id=%s', :jajeno, :jloc), '23514');
SELECT pg_temp.debe_fallar('no se puede borrar un partido con estadisticas', format('DELETE FROM partido WHERE id=%s', :p), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar un jugador con estadisticas', format('DELETE FROM jugador WHERE id=%s', :jloc), '23503');

-- Upsert del backend: reemplaza las cantidades, no las incrementa, y no duplica la fila.
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES (:p,:jloc,2,1,0)
  ON CONFLICT (partido_id,jugador_id) DO UPDATE SET goles=EXCLUDED.goles, asistencias=EXCLUDED.asistencias, tarjetas=EXCLUDED.tarjetas;
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES (:p,:jloc,2,1,0)
  ON CONFLICT (partido_id,jugador_id) DO UPDATE SET goles=EXCLUDED.goles, asistencias=EXCLUDED.asistencias, tarjetas=EXCLUDED.tarjetas;
SELECT pg_temp.esperar('el upsert repetido deja una sola fila', (SELECT count(*) FROM estadistica_partido WHERE partido_id=:p AND jugador_id=:jloc), 1);
SELECT pg_temp.esperar('el upsert reemplaza (2 goles, no 3)', (SELECT goles FROM estadistica_partido WHERE partido_id=:p AND jugador_id=:jloc), 2);

-- Consulta compartida (H6, H9, H10, H11, H22): la temporada y la oficialidad se derivan del partido.
SELECT pg_temp.esperar('consulta compartida: temporada derivada del partido', (SELECT count(*) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.temporada_id=:t AND e.partido_id=:p), 2);
SELECT pg_temp.esperar('Programado: la estadistica no es oficial', (SELECT count(*) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.estado='FINALIZADO' AND e.partido_id=:p), 0);
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:p;
UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id=:p;
SELECT pg_temp.esperar('Finalizado: la estadistica pasa a ser oficial sin tocar estadistica_partido', (SELECT count(*) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.estado='FINALIZADO' AND e.partido_id=:p), 2);
SELECT pg_temp.esperar('goleadores oficiales de la temporada (solo partidos Finalizados)', (SELECT sum(e.goles) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.temporada_id=:t AND p.estado='FINALIZADO' AND e.partido_id=:p), 3);
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan filas de prueba', (SELECT count(*) FROM estadistica_partido WHERE goles<>1 OR asistencias<>0 OR tarjetas<>1), 0);
\echo 'Estadisticas por jugador y partido (DB-9.1) verificadas.'
