-- Verifica DB-24.1: decision de verificacion sobre pago (quien, cuando, motivo). Requiere los seeds de H1.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h24-decision.sql
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


-- Inserta un pago con los datos de decision que se indiquen (NULL = sin dato).
CREATE FUNCTION pg_temp.ins(clave text, estado text, por text, en text, motivo text, cuota int, usuario uuid) RETURNS text AS $$
  SELECT format($q$INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,estado,registrado_por,verificado_por,verificado_en,motivo_rechazo)
                   VALUES (%s,10.00,'2026-11-10',%L,'image/png',1000,%L,%L,%L,%L,%L)$q$, cuota, clave, estado, usuario, por, en, motivo)
$$ LANGUAGE sql;

SELECT pg_temp.esperar('columnas de decision creadas', (SELECT count(*) FROM information_schema.columns WHERE table_name='pago' AND column_name IN ('verificado_por','verificado_en','motivo_rechazo')), 3);
SELECT pg_temp.esperar('restriccion ck_pago_decision creada', (SELECT count(*) FROM pg_constraint WHERE conname='ck_pago_decision'), 1);
SELECT pg_temp.esperar('indice parcial de pendientes creado', (SELECT count(*) FROM pg_indexes WHERE indexname='ix_pago_pendientes' AND indexdef LIKE '%PENDIENTE%'), 1);

BEGIN;
SELECT t.id AS t1 FROM temporada t WHERE t.nombre='Apertura 2026' \gset
SELECT id AS e1 FROM equipo WHERE temporada_id=:t1 ORDER BY id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
SELECT id AS cap FROM usuario WHERE rol='JUGADOR' ORDER BY email LIMIT 1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e1,'INSCRIPCION',500.00,'2026-12-31',:'org') RETURNING id AS c1 \gset

-- PENDIENTE: sin datos de decision
SELECT pg_temp.esperar('pendiente sin datos de decision', pg_temp.filas(pg_temp.ins('d1','PENDIENTE',NULL,NULL,NULL,:c1,:'cap')), 1);
SELECT pg_temp.debe_fallar('pendiente con verificado_por', pg_temp.ins('d2','PENDIENTE',:'org',NULL,NULL,:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('pendiente con verificado_en', pg_temp.ins('d3','PENDIENTE',NULL,now()::text,NULL,:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('pendiente con motivo', pg_temp.ins('d4','PENDIENTE',NULL,NULL,'Motivo con mas de veinte caracteres',:c1,:'cap'), '23514');

-- VERIFICADO: quien y cuando, sin motivo
SELECT pg_temp.esperar('verificado con quien y cuando', pg_temp.filas(pg_temp.ins('d5','VERIFICADO',:'org',now()::text,NULL,:c1,:'cap')), 1);
SELECT pg_temp.debe_fallar('verificado sin verificado_por', pg_temp.ins('d6','VERIFICADO',NULL,now()::text,NULL,:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('verificado sin verificado_en', pg_temp.ins('d7','VERIFICADO',:'org',NULL,NULL,:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('verificado con motivo de rechazo', pg_temp.ins('d8','VERIFICADO',:'org',now()::text,'Motivo con mas de veinte caracteres',:c1,:'cap'), '23514');

-- RECHAZADO: quien, cuando y motivo de al menos 20 caracteres (sin contar espacios de los extremos)
SELECT pg_temp.esperar('rechazado con motivo de 20 caracteres exactos', pg_temp.filas(pg_temp.ins('d9','RECHAZADO',:'org',now()::text,'12345678901234567890',:c1,:'cap')), 1);
SELECT pg_temp.debe_fallar('rechazado con motivo de 19 caracteres', pg_temp.ins('d10','RECHAZADO',:'org',now()::text,'1234567890123456789',:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('rechazado: 19 caracteres rellenos con espacios', pg_temp.ins('d11','RECHAZADO',:'org',now()::text,'   1234567890123456789   ',:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('rechazado con motivo solo de espacios', pg_temp.ins('d12','RECHAZADO',:'org',now()::text,repeat(' ',30),:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('rechazado sin motivo', pg_temp.ins('d13','RECHAZADO',:'org',now()::text,NULL,:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('rechazado sin verificado_por', pg_temp.ins('d14','RECHAZADO',NULL,now()::text,'Motivo con mas de veinte caracteres',:c1,:'cap'), '23514');
SELECT pg_temp.debe_fallar('rechazado sin verificado_en', pg_temp.ins('d15','RECHAZADO',:'org',NULL,'Motivo con mas de veinte caracteres',:c1,:'cap'), '23514');
SELECT pg_temp.esperar('motivo largo (500 caracteres) es valido', pg_temp.filas(pg_temp.ins('d16','RECHAZADO',:'org',now()::text,repeat('x',500),:c1,:'cap')), 1);

-- Quien decide debe existir y no se puede borrar
SELECT pg_temp.debe_fallar('verificado_por inexistente', pg_temp.ins('d17','VERIFICADO','00000000-0000-0000-0000-000000000000',now()::text,NULL,:c1,:'cap'), '23503');
SELECT pg_temp.debe_fallar('no se borra un usuario que decidio un pago', format('DELETE FROM usuario WHERE id=%L', :'org'), '23503');

-- Flujo de decision (lo que hara BE-24.1): PENDIENTE -> VERIFICADO / RECHAZADO
DELETE FROM pago WHERE cuota_id=:c1;
SELECT pg_temp.esperar('dos pendientes de 100 y 40', pg_temp.filas(format($q$INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,registrado_por) VALUES (%s,100,'2026-11-10','f1','image/png',1,%L),(%s,40,'2026-11-10','f2','image/png',1,%L)$q$, :c1, :'cap', :c1, :'cap')), 2);
SELECT pg_temp.esperar('pendientes: saldo 500 y disponible 360', (SELECT saldo*1000+disponible FROM fn_saldo_cuota(:c1))::bigint, 500360);
SELECT pg_temp.debe_fallar('verificar sin registrar la decision', 'UPDATE pago SET estado=''VERIFICADO'' WHERE comprobante_clave=''f1''', '23514');
SELECT pg_temp.esperar('verificar el pago de 100', pg_temp.filas(format('UPDATE pago SET estado=''VERIFICADO'', verificado_por=%L, verificado_en=now() WHERE comprobante_clave=''f1'' AND estado=''PENDIENTE''', :'org')), 1);
SELECT pg_temp.esperar('verificado: saldo 400, disponible 360', (SELECT saldo*1000+disponible FROM fn_saldo_cuota(:c1))::bigint, 400360);
SELECT pg_temp.esperar('rechazar el pago de 40', pg_temp.filas(format('UPDATE pago SET estado=''RECHAZADO'', verificado_por=%L, verificado_en=now(), motivo_rechazo=%L WHERE comprobante_clave=''f2'' AND estado=''PENDIENTE''', :'org', 'Comprobante ilegible o incompleto')), 1);
SELECT pg_temp.esperar('rechazado: saldo 400 y se libera lo reservado (disponible 400)', (SELECT saldo*1000+disponible FROM fn_saldo_cuota(:c1))::bigint, 400400);
SELECT pg_temp.esperar('la decision queda trazable (quien y cuando)', (SELECT count(*) FROM pago WHERE cuota_id=:c1 AND verificado_por=:'org' AND verificado_en IS NOT NULL), 2);
SELECT pg_temp.esperar('el motivo del rechazo se conserva', (SELECT count(*) FROM pago WHERE comprobante_clave='f2' AND motivo_rechazo='Comprobante ilegible o incompleto'), 1);
-- Una decision ya tomada no se "vuelve a tomar" con la condicion de BE-24.1 (estado = PENDIENTE): 0 filas
SELECT pg_temp.esperar('segunda decision sobre un pago resuelto no afecta filas', pg_temp.filas(format('UPDATE pago SET estado=''RECHAZADO'', verificado_por=%L, verificado_en=now(), motivo_rechazo=%L WHERE comprobante_clave=''f1'' AND estado=''PENDIENTE''', :'org', 'Segundo intento de decision')), 0);
SELECT pg_temp.debe_fallar('volver a PENDIENTE sin limpiar la decision', 'UPDATE pago SET estado=''PENDIENTE'' WHERE comprobante_clave=''f1''', '23514');
SELECT pg_temp.esperar('un pendiente nuevo de 5', pg_temp.filas(pg_temp.ins('g1','PENDIENTE',NULL,NULL,NULL,:c1,:'cap')), 1);
SELECT pg_temp.debe_fallar('datos de decision sobre un pago PENDIENTE', format('UPDATE pago SET verificado_por=%L WHERE comprobante_clave=''g1''', :'org'), '23514');
ROLLBACK;
SELECT pg_temp.esperar('despues del ROLLBACK no quedan pagos', (SELECT count(*) FROM pago), 0);
\echo 'Decision de verificacion de pagos (DB-24.1) verificada.'
