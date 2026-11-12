-- Verifica DB-23.1: tabla correccion_partido (auditoria de correcciones de resultados). Requiere el seed de H1 y DB-3.2.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h23-auditoria.sql
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


CREATE FUNCTION pg_temp.ins(partido int, usuario text, motivo text, antes text, despues text) RETURNS text AS $$
  SELECT format($q$INSERT INTO correccion_partido(partido_id,usuario_id,motivo,antes,despues) VALUES (%s,%s,%L,%L::jsonb,%L::jsonb)$q$, partido, usuario, motivo, antes, despues)
$$ LANGUAGE sql;

SELECT pg_temp.esperar('tabla correccion_partido creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='correccion_partido'), 1);
SELECT pg_temp.esperar('indice ix_correccion_partido creado', (SELECT count(*) FROM pg_indexes WHERE indexname='ix_correccion_partido'), 1);

BEGIN;
SELECT id AS p1 FROM partido ORDER BY id LIMIT 1 \gset
SELECT id AS p2 FROM partido ORDER BY id OFFSET 1 LIMIT 1 \gset
SELECT quote_literal(id) AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
\set antes '{"golesLocal":1,"golesVisitante":0}'
\set despues '{"golesLocal":1,"golesVisitante":2}'
\set motivo 'Error de captura del arbitro en el acta'

-- Insercion valida
SELECT pg_temp.esperar('correccion valida', pg_temp.filas(pg_temp.ins(:p1, :'org', :'motivo', :'antes', :'despues')), 1);
SELECT pg_temp.esperar('la fecha se pone sola (now)', (SELECT count(*) FROM correccion_partido WHERE fecha >= now() - interval '1 minute'), 1);
SELECT pg_temp.esperar('antes y despues se guardan como JSONB consultable', (SELECT (despues->>'golesVisitante')::bigint FROM correccion_partido WHERE partido_id=:p1), 2);

-- Referencias
SELECT pg_temp.debe_fallar('partido inexistente', pg_temp.ins(0, :'org', :'motivo', :'antes', :'despues'), '23503');
SELECT pg_temp.debe_fallar('usuario inexistente', pg_temp.ins(:p1, quote_literal('00000000-0000-0000-0000-000000000000'), :'motivo', :'antes', :'despues'), '23503');
SELECT pg_temp.debe_fallar('usuario NULL', pg_temp.ins(:p1, 'NULL', :'motivo', :'antes', :'despues'), '23502');
SELECT pg_temp.debe_fallar('no se borra un partido con auditoria', format('DELETE FROM partido WHERE id=%s', :p1), '23503');
SELECT pg_temp.debe_fallar('no se borra un usuario con auditoria', format('DELETE FROM usuario WHERE id=%s', :'org'), '23503');

-- Motivo: al menos 20 caracteres sin contar espacios de los extremos
SELECT pg_temp.esperar('motivo de 20 caracteres exactos', pg_temp.filas(pg_temp.ins(:p1, :'org', '12345678901234567890', :'antes', :'despues')), 1);
SELECT pg_temp.debe_fallar('motivo de 19 caracteres', pg_temp.ins(:p1, :'org', '1234567890123456789', :'antes', :'despues'), '23514');
SELECT pg_temp.debe_fallar('motivo de 19 caracteres con espacios alrededor', pg_temp.ins(:p1, :'org', '   1234567890123456789   ', :'antes', :'despues'), '23514');
SELECT pg_temp.debe_fallar('motivo solo de espacios', pg_temp.ins(:p1, :'org', repeat(' ', 30), :'antes', :'despues'), '23514');
SELECT pg_temp.debe_fallar('motivo vacio', pg_temp.ins(:p1, :'org', '', :'antes', :'despues'), '23514');
SELECT pg_temp.debe_fallar('motivo NULL', format('INSERT INTO correccion_partido(partido_id,usuario_id,motivo,antes,despues) VALUES (%s,%s,NULL,''{"a":1}'',''{"a":2}'')', :p1, :'org'), '23502');

-- Antes y despues
SELECT pg_temp.debe_fallar('antes NULL', format('INSERT INTO correccion_partido(partido_id,usuario_id,motivo,antes,despues) VALUES (%s,%s,%L,NULL,''{"a":2}'')', :p1, :'org', :'motivo'), '23502');
SELECT pg_temp.debe_fallar('despues NULL', format('INSERT INTO correccion_partido(partido_id,usuario_id,motivo,antes,despues) VALUES (%s,%s,%L,''{"a":1}'',NULL)', :p1, :'org', :'motivo'), '23502');
SELECT pg_temp.debe_fallar('antes = JSON null', pg_temp.ins(:p1, :'org', :'motivo', 'null', :'despues'), '23514');
SELECT pg_temp.debe_fallar('despues es una lista', pg_temp.ins(:p1, :'org', :'motivo', :'antes', '[1,2]'), '23514');
SELECT pg_temp.debe_fallar('despues es un numero', pg_temp.ins(:p1, :'org', :'motivo', :'antes', '5'), '23514');
SELECT pg_temp.debe_fallar('JSON invalido', pg_temp.ins(:p1, :'org', :'motivo', :'antes', '{no es json'), '22P02');
SELECT pg_temp.debe_fallar('antes igual a despues (no es una correccion)', pg_temp.ins(:p1, :'org', :'motivo', :'antes', :'antes'), '23514');
SELECT pg_temp.esperar('igual en contenido aunque cambie el orden de las llaves tambien se rechaza',
  (SELECT count(*) FROM (SELECT pg_temp.debe_fallar('llaves en otro orden', pg_temp.ins(:p1, :'org', :'motivo', '{"a":1,"b":2}', '{"b":2,"a":1}'), '23514')) x), 1);

-- Es solo de insercion
SELECT pg_temp.debe_fallar('UPDATE sobre una fila de auditoria', 'UPDATE correccion_partido SET motivo = repeat(''x'', 30)', '23001');
SELECT pg_temp.debe_fallar('DELETE sobre una fila de auditoria', 'DELETE FROM correccion_partido', '23001');
SELECT pg_temp.esperar('las filas siguen intactas', (SELECT count(*) FROM correccion_partido WHERE motivo <> repeat('x', 30)), 2);

-- Varias correcciones del mismo partido: la mas reciente primero (el indice sirve a esa consulta)
SELECT pg_temp.esperar('otra correccion en el mismo partido', pg_temp.filas(pg_temp.ins(:p1, :'org', :'motivo', :'despues', '{"golesLocal":2,"golesVisitante":2}')), 1);
SELECT pg_temp.esperar('un partido ajeno no se mezcla', (SELECT count(*) FROM correccion_partido WHERE partido_id=:p2), 0);
SELECT pg_temp.esperar('historial del partido: 3 correcciones', (SELECT count(*) FROM correccion_partido WHERE partido_id=:p1), 3);
ROLLBACK;

-- La auditoria vive en la transaccion de la correccion: si esta se revierte, tampoco queda fila.
SELECT pg_temp.esperar('tras el ROLLBACK no queda auditoria', (SELECT count(*) FROM correccion_partido), 0);
\echo 'Auditoria de correcciones (DB-23.1) verificada.'
