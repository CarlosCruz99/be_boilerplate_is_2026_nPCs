-- Verifica DB-15.1: cambio_partido y entrega_correo. Requiere los seeds de H1 y DB-3.2.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h15-restricciones.sql
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

SELECT pg_temp.esperar('tablas creadas', (SELECT count(*) FROM information_schema.tables WHERE table_name IN ('cambio_partido','entrega_correo')), 2);
SELECT pg_temp.esperar('indices del documento', (SELECT count(*) FROM pg_indexes WHERE indexname IN ('ix_cambio_partido_partido_fecha','ix_entrega_correo_estado')), 2);

BEGIN;
SELECT id AS p, cancha_id AS cancha FROM partido ORDER BY id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
SELECT capitan_id AS u1 FROM equipo ORDER BY id LIMIT 1 \gset
SELECT capitan_id AS u2 FROM equipo ORDER BY id OFFSET 1 LIMIT 1 \gset

-- Cambios de fecha, hora y cancha
SELECT pg_temp.esperar('cambio de fecha', pg_temp.filas(format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'FECHA','2026-11-07','2026-11-08',%L)$q$, :p, :'org')), 1);
SELECT pg_temp.esperar('cambio de hora', pg_temp.filas(format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'HORA','08:00','09:30',%L)$q$, :p, :'org')), 1);
SELECT pg_temp.esperar('cambio de cancha (guarda ids)', pg_temp.filas(format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'CANCHA','%s','%s',%L)$q$, :p, :cancha, :cancha + 1, :'org')), 1);
SELECT pg_temp.esperar('modificado_en se llena solo', (SELECT count(*) FROM cambio_partido WHERE partido_id=:p AND modificado_en IS NOT NULL), 3);
SELECT pg_temp.esperar('un cambio se recupera con anterior, nuevo y usuario', (SELECT count(*) FROM cambio_partido c JOIN usuario u ON u.id=c.modificado_por
  WHERE c.partido_id=:p AND c.campo_modificado='HORA' AND c.valor_anterior='08:00' AND c.valor_nuevo='09:30' AND u.id=:'org'), 1);
SELECT pg_temp.esperar('el nombre de la cancha se obtiene por relacion', (SELECT count(*) FROM cambio_partido c JOIN cancha ca ON ca.id=c.valor_anterior::int
  WHERE c.partido_id=:p AND c.campo_modificado='CANCHA'), 1);

-- Lo que no genera evento
SELECT pg_temp.debe_fallar('campo no notificable (ARBITRO)', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'ARBITRO','a','b',%L)$q$, :p, :'org'), '22P02');
SELECT pg_temp.debe_fallar('valor nuevo igual al anterior', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'HORA','08:00','08:00',%L)$q$, :p, :'org'), '23514');
SELECT pg_temp.debe_fallar('cancha con un nombre en lugar de un id', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'CANCHA','Cancha 1','Cancha 2',%L)$q$, :p, :'org'), '23514');
SELECT pg_temp.debe_fallar('valor nulo', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'HORA',NULL,'08:00',%L)$q$, :p, :'org'), '23502');
SELECT pg_temp.debe_fallar('partido inexistente', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (0,'HORA','08:00','09:00',%L)$q$, :'org'), '23503');
SELECT pg_temp.debe_fallar('usuario inexistente', format($q$INSERT INTO cambio_partido(partido_id,campo_modificado,valor_anterior,valor_nuevo,modificado_por) VALUES (%s,'HORA','08:00','09:00',gen_random_uuid())$q$, :p), '23503');

-- Entregas de correo
SELECT min(id) AS c1 FROM cambio_partido WHERE partido_id=:p \gset
SELECT max(id) AS c2 FROM cambio_partido WHERE partido_id=:p \gset
SELECT pg_temp.esperar('entrega al usuario 1', pg_temp.filas(format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (%s,%L)', :c1, :'u1')), 1);
SELECT pg_temp.esperar('valores por defecto: PENDIENTE, 0 intentos, sin ultimo intento', (SELECT count(*) FROM entrega_correo WHERE cambio_id=:c1 AND estado='PENDIENTE' AND intentos=0 AND ultimo_intento_en IS NULL), 1);
SELECT pg_temp.debe_fallar('duplicar la entrega al mismo usuario y cambio', format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (%s,%L)', :c1, :'u1'), '23505');
SELECT pg_temp.esperar('el mismo usuario en otro cambio', pg_temp.filas(format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (%s,%L)', :c2, :'u1')), 1);
SELECT pg_temp.esperar('otro usuario en el mismo cambio', pg_temp.filas(format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (%s,%L)', :c1, :'u2')), 1);
SELECT pg_temp.debe_fallar('estado fuera de la lista', format($q$INSERT INTO entrega_correo(cambio_id,usuario_id,estado) VALUES (%s,%L,'REBOTADO')$q$, :c2, :'u2'), '22P02');
SELECT pg_temp.debe_fallar('intentos negativos', format('UPDATE entrega_correo SET intentos=-1 WHERE cambio_id=%s AND usuario_id=%L', :c1, :'u1'), '23514');
SELECT pg_temp.debe_fallar('cambio inexistente', format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (0,%L)', :'u1'), '23503');
SELECT pg_temp.debe_fallar('usuario inexistente', format('INSERT INTO entrega_correo(cambio_id,usuario_id) VALUES (%s,gen_random_uuid())', :c2), '23503');

-- Una falla de correo no elimina el evento
UPDATE entrega_correo SET estado='FALLIDO', intentos=3, ultimo_intento_en=now() WHERE cambio_id=:c1 AND usuario_id=:'u1';
SELECT pg_temp.esperar('entrega FALLIDA con 3 intentos', (SELECT count(*) FROM entrega_correo WHERE cambio_id=:c1 AND usuario_id=:'u1' AND estado='FALLIDO' AND intentos=3), 1);
SELECT pg_temp.esperar('el evento sigue intacto tras la falla', (SELECT count(*) FROM cambio_partido WHERE id=:c1), 1);
SELECT pg_temp.debe_fallar('no se puede borrar un cambio con entregas', format('DELETE FROM cambio_partido WHERE id=%s', :c1), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar un partido con cambios', format('DELETE FROM partido WHERE id=%s', :p), '23503');
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan cambios ni entregas', (SELECT count(*) FROM cambio_partido) + (SELECT count(*) FROM entrega_correo), 0);
\echo 'Cambios de partido y entregas de correo (DB-15.1) verificados.'
