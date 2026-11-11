-- Verifica DB-5.1: marcador, faltas, tiempos reales, bitacora y participantes.
-- Requiere el seed de H1 y DB-3.2. No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h5-restricciones.sql
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

SELECT pg_temp.esperar('columnas nuevas en partido', (SELECT count(*) FROM information_schema.columns WHERE table_name='partido'
  AND column_name IN ('goles_local','goles_visitante','faltas_local','faltas_visitante','inicio_real','fin_real')), 6);
SELECT pg_temp.esperar('tablas bitacora_marcador y participacion_partido', (SELECT count(*) FROM information_schema.tables
  WHERE table_name IN ('bitacora_marcador','participacion_partido')), 2);
SELECT pg_temp.esperar('partidos existentes con marcador 0-0 y faltas 0', (SELECT count(*) FROM partido
  WHERE goles_local=0 AND goles_visitante=0 AND faltas_local=0 AND faltas_visitante=0), (SELECT count(*) FROM partido));

BEGIN;
-- Un partido Programado y uno de equipos conocidos; un jugador por equipo.
SELECT id AS p, equipo_local_id AS loc, equipo_visitante_id AS vis FROM partido WHERE estado='PROGRAMADO' ORDER BY id LIMIT 1 \gset
SELECT jugador_id AS jloc FROM equipo_jugador WHERE equipo_id=:loc ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jvis FROM equipo_jugador WHERE equipo_id=:vis ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jvis2 FROM equipo_jugador WHERE equipo_id=:vis AND jugador_id<>:jvis ORDER BY jugador_id LIMIT 1 \gset
SELECT equipo_id AS ajeno, jugador_id AS jajeno FROM equipo_jugador WHERE equipo_id NOT IN (:loc,:vis) ORDER BY equipo_id, jugador_id LIMIT 1 \gset
SELECT id AS u FROM usuario WHERE rol='ARBITRO' ORDER BY email LIMIT 1 \gset

-- 1) Goles y faltas de 0 a 99
SELECT pg_temp.debe_fallar('goles_local = 100', format('UPDATE partido SET goles_local=100 WHERE id=%s', :p), '23514');
SELECT pg_temp.debe_fallar('goles_local = -1', format('UPDATE partido SET goles_local=-1 WHERE id=%s', :p), '23514');
SELECT pg_temp.debe_fallar('goles_visitante = 100', format('UPDATE partido SET goles_visitante=100 WHERE id=%s', :p), '23514');
SELECT pg_temp.debe_fallar('faltas_local = 100', format('UPDATE partido SET faltas_local=100 WHERE id=%s', :p), '23514');
SELECT pg_temp.debe_fallar('faltas_visitante = -1', format('UPDATE partido SET faltas_visitante=-1 WHERE id=%s', :p), '23514');
SELECT pg_temp.esperar('marcador 99 y 0 se aceptan', pg_temp.filas(format('UPDATE partido SET goles_local=99, goles_visitante=0, faltas_local=99, faltas_visitante=0 WHERE id=%s', :p)), 1);

-- 2) Tiempos reales segun el estado
SELECT pg_temp.debe_fallar('En curso sin inicio_real', format($q$UPDATE partido SET estado='EN_CURSO' WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.debe_fallar('Finalizado sin fin_real', format($q$UPDATE partido SET estado='FINALIZADO', inicio_real=now() WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.debe_fallar('Finalizado sin inicio_real', format($q$UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.debe_fallar('Finalizado con fin_real anterior a inicio_real', format($q$UPDATE partido SET estado='FINALIZADO', inicio_real=now(), fin_real=now() - interval '1 hour' WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.debe_fallar('Programado con inicio_real', format('UPDATE partido SET inicio_real=now() WHERE id=%s', :p), '23514');
SELECT pg_temp.debe_fallar('En curso con fin_real', format($q$UPDATE partido SET estado='EN_CURSO', inicio_real=now(), fin_real=now() WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.debe_fallar('Cancelado con inicio_real', format($q$UPDATE partido SET estado='CANCELADO', inicio_real=now() WHERE id=%s$q$, :p), '23514');
SELECT pg_temp.esperar('el partido sigue Programado tras los rechazos', (SELECT count(*) FROM partido WHERE id=:p AND estado='PROGRAMADO' AND inicio_real IS NULL), 1);
SELECT pg_temp.esperar('En curso con inicio_real se acepta', pg_temp.filas(format($q$UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=%s$q$, :p)), 1);
SELECT pg_temp.esperar('Finalizado con ambos tiempos se acepta', pg_temp.filas(format($q$UPDATE partido SET estado='FINALIZADO', fin_real=now() + interval '90 minutes' WHERE id=%s$q$, :p)), 1);
SELECT pg_temp.esperar('Cancelado sin tiempos se acepta (otro partido)', pg_temp.filas($q$UPDATE partido SET estado='CANCELADO' WHERE id=(SELECT id FROM partido WHERE estado='PROGRAMADO' ORDER BY id DESC LIMIT 1)$q$), 1);

-- 3) Participantes
SELECT pg_temp.esperar('participante del equipo local', pg_temp.filas(format('INSERT INTO participacion_partido VALUES (%s,%s,%s)', :p, :jloc, :loc)), 1);
SELECT pg_temp.esperar('participante del equipo visitante', pg_temp.filas(format('INSERT INTO participacion_partido VALUES (%s,%s,%s)', :p, :jvis, :vis)), 1);
SELECT pg_temp.debe_fallar('el mismo jugador dos veces en el partido', format('INSERT INTO participacion_partido VALUES (%s,%s,%s)', :p, :jloc, :loc), '23505');
SELECT pg_temp.debe_fallar('jugador que no pertenece al equipo indicado', format('INSERT INTO participacion_partido VALUES (%s,%s,%s)', :p, :jvis2, :loc), '23503');
SELECT pg_temp.debe_fallar('jugador de un equipo que no juega el partido', format('INSERT INTO participacion_partido VALUES (%s,%s,%s)', :p, :jajeno, :ajeno), '23514');
SELECT pg_temp.debe_fallar('partido inexistente', format('INSERT INTO participacion_partido VALUES (0,%s,%s)', :jloc, :loc), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar un partido con participantes', format('DELETE FROM partido WHERE id=%s', :p), '23503');

-- 4) Bitacora
SELECT pg_temp.esperar('bitacora valida', pg_temp.filas(format($q$INSERT INTO bitacora_marcador(partido_id,usuario_id,goles_local,goles_visitante,faltas_local,faltas_visitante,accion) VALUES (%s,%L,1,0,2,3,'ACTUALIZAR')$q$, :p, :'u')), 1);
SELECT pg_temp.debe_fallar('bitacora con partido inexistente', format($q$INSERT INTO bitacora_marcador(partido_id,usuario_id,goles_local,goles_visitante,faltas_local,faltas_visitante,accion) VALUES (0,%L,0,0,0,0,'INICIAR')$q$, :'u'), '23503');
SELECT pg_temp.debe_fallar('bitacora con usuario inexistente', format($q$INSERT INTO bitacora_marcador(partido_id,usuario_id,goles_local,goles_visitante,faltas_local,faltas_visitante,accion) VALUES (%s,gen_random_uuid(),0,0,0,0,'INICIAR')$q$, :p), '23503');
SELECT pg_temp.debe_fallar('bitacora con accion invalida', format($q$INSERT INTO bitacora_marcador(partido_id,usuario_id,goles_local,goles_visitante,faltas_local,faltas_visitante,accion) VALUES (%s,%L,0,0,0,0,'BORRAR')$q$, :p, :'u'), '23514');
SELECT pg_temp.debe_fallar('bitacora con goles fuera de rango', format($q$INSERT INTO bitacora_marcador(partido_id,usuario_id,goles_local,goles_visitante,faltas_local,faltas_visitante,accion) VALUES (%s,%L,100,0,0,0,'ACTUALIZAR')$q$, :p, :'u'), '23514');
SELECT pg_temp.debe_fallar('no se puede borrar un usuario con bitacora', format('DELETE FROM usuario WHERE id=%L', :'u'), '23503');
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan participantes ni bitacora', (SELECT count(*) FROM participacion_partido) + (SELECT count(*) FROM bitacora_marcador), 0);
SELECT pg_temp.esperar('partidos intactos', (SELECT count(*) FROM partido), 66);
\echo 'Marcador, bitacora y participantes (DB-5.1) verificados.'
