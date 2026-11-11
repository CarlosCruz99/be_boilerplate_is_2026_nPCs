-- Verifica DB-12.1: tabla cuota. Requiere los seeds de H1 y DB-3.2. No deja datos (transaccion que se revierte).
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h12-restricciones.sql
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

SELECT pg_temp.esperar('tabla cuota creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='cuota'), 1);
SELECT pg_temp.esperar('indices unicos parciales', (SELECT count(*) FROM pg_indexes WHERE tablename='cuota' AND indexname IN ('uq_cuota_inscripcion','uq_cuota_arbitraje')), 2);

BEGIN;
SELECT t.id AS t1 FROM temporada t WHERE t.nombre='Apertura 2026' \gset
SELECT id AS e1 FROM equipo WHERE temporada_id=:t1 ORDER BY id LIMIT 1 \gset
SELECT id AS e2 FROM equipo WHERE temporada_id=:t1 ORDER BY id OFFSET 1 LIMIT 1 \gset
SELECT e.id AS eotra, e.temporada_id AS totra FROM equipo e WHERE e.temporada_id<>:t1 ORDER BY e.id LIMIT 1 \gset
SELECT id AS p FROM partido WHERE temporada_id=:t1 ORDER BY id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset

-- Inscripcion
SELECT pg_temp.esperar('cuota de inscripcion valida', pg_temp.filas(format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',125.00,'2026-12-31',%L)$q$, :t1, :e1, :'org')), 1);
SELECT pg_temp.debe_fallar('segunda inscripcion del mismo equipo y temporada', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',50.00,'2026-12-31',%L)$q$, :t1, :e1, :'org'), '23505');
SELECT pg_temp.esperar('inscripcion de otro equipo se acepta', pg_temp.filas(format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',125.00,'2026-12-31',%L)$q$, :t1, :e2, :'org')), 1);

-- Arbitraje
SELECT pg_temp.esperar('cuota de arbitraje valida', pg_temp.filas(format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'ARBITRAJE',%s,15.50,'2026-12-31',%L)$q$, :t1, :e1, :p, :'org')), 1);
SELECT pg_temp.debe_fallar('segundo arbitraje del mismo equipo y partido', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'ARBITRAJE',%s,10.00,'2026-12-31',%L)$q$, :t1, :e1, :p, :'org'), '23505');
SELECT pg_temp.esperar('el mismo equipo puede tener inscripcion y arbitraje', (SELECT count(*) FROM cuota WHERE equipo_id=:e1), 2);
SELECT pg_temp.esperar('arbitraje del otro equipo en el mismo partido se acepta', pg_temp.filas(format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'ARBITRAJE',%s,15.50,'2026-12-31',%L)$q$, :t1, :e2, :p, :'org')), 1);

-- Solo el arbitraje lleva partido
SELECT pg_temp.debe_fallar('inscripcion con partido', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',%s,10.00,'2026-12-31',%L)$q$, :t1, :eotra, :p, :'org'), '23514');
SELECT pg_temp.debe_fallar('arbitraje sin partido', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'ARBITRAJE',10.00,'2026-12-31',%L)$q$, :t1, :e1, :'org'), '23514');

-- Monto
SELECT pg_temp.debe_fallar('monto cero', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',0,'2026-12-31',%L)$q$, :totra, :eotra, :'org'), '23514');
SELECT pg_temp.debe_fallar('monto negativo', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',-5.00,'2026-12-31',%L)$q$, :totra, :eotra, :'org'), '23514');
SELECT pg_temp.debe_fallar('monto que sobrepasa NUMERIC(12,2)', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',10000000000.00,'2026-12-31',%L)$q$, :totra, :eotra, :'org'), '22003');

-- Referencias
SELECT pg_temp.debe_fallar('equipo de otra temporada', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',10.00,'2026-12-31',%L)$q$, :t1, :eotra, :'org'), '23503');
SELECT pg_temp.debe_fallar('equipo inexistente', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,0,'INSCRIPCION',10.00,'2026-12-31',%L)$q$, :t1, :'org'), '23503');
SELECT pg_temp.debe_fallar('partido inexistente', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'ARBITRAJE',0,10.00,'2026-12-31',%L)$q$, :t1, :e2, :'org'), '23503');
SELECT pg_temp.debe_fallar('creador inexistente', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',10.00,'2026-12-31',gen_random_uuid())$q$, :totra, :eotra), '23503');
SELECT pg_temp.debe_fallar('concepto fuera de la lista', format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'OTRO',10.00,'2026-12-31',%L)$q$, :totra, :eotra, :'org'), '22P02');
SELECT pg_temp.debe_fallar('no se puede borrar un equipo con cuotas', format('DELETE FROM equipo WHERE id=%s', :e1), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar un partido con cuotas', format('DELETE FROM partido WHERE id=%s', :p), '23503');

-- Decimales: NUMERIC(12,2) redondea en silencio; por eso BE-12.1 debe rechazar mas de 2 decimales ANTES de guardar.
SELECT pg_temp.esperar('(aviso para BE-12.1) 10.005 se guarda como 10.01 sin error', pg_temp.filas(format($q$INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (%s,%s,'INSCRIPCION',10.005,'2026-12-31',%L)$q$, :totra, :eotra, :'org')), 1);
SELECT pg_temp.esperar('el monto guardado quedo redondeado a 10.01', (SELECT count(*) FROM cuota WHERE equipo_id=:eotra AND monto=10.01), 1);
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan cuotas', (SELECT count(*) FROM cuota), 0);
\echo 'Tabla cuota (DB-12.1) verificada.'
