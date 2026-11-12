-- Verifica DB-8.1: tabla posicion. Requiere el seed de H1. No deja datos (transaccion que se revierte).
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h8-restricciones.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- La sentencia DEBE fallar con el SQLSTATE indicado: 23514 check, 23503 FK, 23505 unico.
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

SELECT pg_temp.esperar('tabla posicion creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='posicion'), 1);
BEGIN;
SELECT t.id AS t1, e.id AS e1 FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Apertura 2026' ORDER BY e.id LIMIT 1 \gset
SELECT t.id AS t2, e.id AS e2 FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre<>'Apertura 2026' ORDER BY t.id, e.id LIMIT 1 \gset

SELECT pg_temp.esperar('fila con valores por defecto (todo en cero)', pg_temp.filas(format('INSERT INTO posicion(temporada_id,equipo_id) VALUES (%s,%s)', :t1, :e1)), 1);
SELECT pg_temp.esperar('el cero cumple todas las restricciones', (SELECT count(*) FROM posicion WHERE equipo_id=:e1 AND puntos=0 AND pj=0), 1);
SELECT pg_temp.debe_fallar('dos filas del mismo equipo en la misma temporada', format('INSERT INTO posicion(temporada_id,equipo_id) VALUES (%s,%s)', :t1, :e1), '23505');
SELECT pg_temp.debe_fallar('equipo de otra temporada', format('INSERT INTO posicion(temporada_id,equipo_id) VALUES (%s,%s)', :t1, :e2), '23503');
SELECT pg_temp.debe_fallar('equipo inexistente', format('INSERT INTO posicion(temporada_id,equipo_id) VALUES (%s,0)', :t1), '23503');
SELECT pg_temp.debe_fallar('temporada inexistente', format('INSERT INTO posicion(temporada_id,equipo_id) VALUES (0,%s)', :e2), '23503');

SELECT pg_temp.esperar('fila coherente: 3 ganados, 1 empatado, 2 perdidos', pg_temp.filas(format('INSERT INTO posicion(temporada_id,equipo_id,pj,pg,pe,pp,gf,gc,dg,puntos) VALUES (%s,%s,6,3,1,2,10,7,3,10)', :t2, :e2)), 1);
SELECT pg_temp.debe_fallar('pj distinto de pg + pe + pp', format('UPDATE posicion SET pj=7 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.debe_fallar('valor negativo (gf)', format('UPDATE posicion SET gf=-1, dg=-8 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.debe_fallar('valor negativo (pp)', format('UPDATE posicion SET pp=-1, pj=4 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.debe_fallar('valor negativo (puntos)', format('UPDATE posicion SET puntos=-1 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.debe_fallar('dg distinto de gf - gc', format('UPDATE posicion SET dg=5 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.debe_fallar('puntos distintos de 3 por ganado + 1 por empatado', format('UPDATE posicion SET puntos=11 WHERE equipo_id=%s', :e2), '23514');
SELECT pg_temp.esperar('dg negativo es valido si gf < gc', pg_temp.filas(format('UPDATE posicion SET gf=2, gc=9, dg=-7 WHERE equipo_id=%s', :e2)), 1);
SELECT pg_temp.debe_fallar('no se puede borrar un equipo con posicion', format('DELETE FROM equipo WHERE id=%s', :e2), '23503');
ROLLBACK;
SELECT pg_temp.esperar('despues del ROLLBACK no quedan filas', (SELECT count(*) FROM posicion), 0);
\echo 'Tabla posicion (DB-8.1) verificada.'
