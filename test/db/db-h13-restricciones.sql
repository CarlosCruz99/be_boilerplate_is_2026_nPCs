-- Verifica DB-13.1: tabla pago, reserva del disponible y fn_saldo_cuota. Requiere los seeds de H1 y DB-3.2.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h13-restricciones.sql
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

CREATE FUNCTION pg_temp.ins(cuota int, monto numeric, estado text, clave_arch text, usuario uuid, idem text DEFAULT NULL,
                            mime text DEFAULT 'image/png', bytes int DEFAULT 1000) RETURNS text AS $$
  SELECT format($q$INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,estado,registrado_por,clave_idempotencia)
                   VALUES (%s,%s,'2026-11-10',%L,%L,%s,%L,%L,%L)$q$, cuota, monto, clave_arch, mime, bytes, estado, usuario, idem)
$$ LANGUAGE sql;

SELECT pg_temp.esperar('tabla pago creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='pago'), 1);
SELECT pg_temp.esperar('funcion fn_saldo_cuota creada', (SELECT count(*) FROM pg_proc WHERE proname='fn_saldo_cuota'), 1);

BEGIN;
SELECT t.id AS t1 FROM temporada t WHERE t.nombre='Apertura 2026' \gset
SELECT id AS e1 FROM equipo WHERE temporada_id=:t1 ORDER BY id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
SELECT id AS cap FROM usuario WHERE rol='JUGADOR' ORDER BY email LIMIT 1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e1,'INSCRIPCION',100.00,'2026-12-31',:'org') RETURNING id AS c1 \gset
SELECT id AS e2 FROM equipo WHERE temporada_id=:t1 ORDER BY id OFFSET 1 LIMIT 1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e2,'INSCRIPCION',80.00,'2026-12-31',:'org') RETURNING id AS c2 \gset

-- Cuota sin pagos
SELECT pg_temp.esperar('sin pagos: saldo = monto', (SELECT saldo FROM fn_saldo_cuota(:c1))::bigint, 100);
SELECT pg_temp.esperar('sin pagos: disponible = monto', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 100);

-- Pendientes reservan disponible sin reducir el saldo
SELECT pg_temp.esperar('pago pendiente de 30', pg_temp.filas(pg_temp.ins(:c1, 30.00, 'PENDIENTE', 'k1', :'cap', 'idem-1')), 1);
SELECT pg_temp.esperar('pendiente: el saldo NO baja (100)', (SELECT saldo FROM fn_saldo_cuota(:c1))::bigint, 100);
SELECT pg_temp.esperar('pendiente: el disponible baja a 70', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 70);
SELECT pg_temp.esperar('pendiente: pendiente_verificacion = 30', (SELECT pendiente_verificacion FROM fn_saldo_cuota(:c1))::bigint, 30);

-- Verificados reducen el saldo
SELECT pg_temp.esperar('pago verificado de 20', pg_temp.filas(pg_temp.ins(:c1, 20.00, 'VERIFICADO', 'k2', :'cap')), 1);
SELECT pg_temp.esperar('verificado: saldo = 80', (SELECT saldo FROM fn_saldo_cuota(:c1))::bigint, 80);
SELECT pg_temp.esperar('verificado: total_verificado = 20', (SELECT total_verificado FROM fn_saldo_cuota(:c1))::bigint, 20);
SELECT pg_temp.esperar('disponible = 100 - 20 - 30 = 50', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 50);

-- Rechazados no aportan ni reservan
SELECT pg_temp.esperar('pago rechazado de 100 (no reserva)', pg_temp.filas(pg_temp.ins(:c1, 100.00, 'RECHAZADO', 'k3', :'cap')), 1);
SELECT pg_temp.esperar('rechazado: el saldo sigue en 80', (SELECT saldo FROM fn_saldo_cuota(:c1))::bigint, 80);
SELECT pg_temp.esperar('rechazado: el disponible sigue en 50', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 50);

-- El disponible no se puede superar
SELECT pg_temp.debe_fallar('pendiente que supera el disponible (60 > 50)', pg_temp.ins(:c1, 60.00, 'PENDIENTE', 'k4', :'cap'), '23514');
SELECT pg_temp.debe_fallar('verificado que supera el disponible', pg_temp.ins(:c1, 50.01, 'VERIFICADO', 'k5', :'cap'), '23514');
SELECT pg_temp.esperar('pendiente que agota el disponible (50)', pg_temp.filas(pg_temp.ins(:c1, 50.00, 'PENDIENTE', 'k6', :'cap')), 1);
SELECT pg_temp.esperar('disponible = 0', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 0);
SELECT pg_temp.debe_fallar('un centavo mas', pg_temp.ins(:c1, 0.01, 'PENDIENTE', 'k7', :'cap'), '23514');

-- Transiciones (H24): rechazar libera lo reservado; verificar lo pasa de reserva a saldo
UPDATE pago SET estado='RECHAZADO' WHERE comprobante_clave='k6';
SELECT pg_temp.esperar('al rechazar un pendiente se libera su disponible (50)', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 50);
UPDATE pago SET estado='VERIFICADO' WHERE comprobante_clave='k1';
SELECT pg_temp.esperar('al verificar: saldo = 50', (SELECT saldo FROM fn_saldo_cuota(:c1))::bigint, 50);
SELECT pg_temp.esperar('al verificar: el disponible no cambia (50)', (SELECT disponible FROM fn_saldo_cuota(:c1))::bigint, 50);
SELECT pg_temp.esperar('al verificar: pendiente_verificacion = 0', (SELECT pendiente_verificacion FROM fn_saldo_cuota(:c1))::bigint, 0);
SELECT pg_temp.debe_fallar('reabrir un rechazado sin disponible suficiente', 'UPDATE pago SET estado=''PENDIENTE'', monto=60 WHERE comprobante_clave=''k3''', '23514');

-- Otra cuota no se mezcla
SELECT pg_temp.esperar('la otra cuota no se afecta (80)', (SELECT disponible FROM fn_saldo_cuota(:c2))::bigint, 80);
SELECT pg_temp.esperar('sin argumento devuelve todas las cuotas', (SELECT count(*) FROM fn_saldo_cuota()), (SELECT count(*) FROM cuota));

-- Restricciones de la tabla
SELECT pg_temp.debe_fallar('monto cero', pg_temp.ins(:c2, 0, 'PENDIENTE', 'm0', :'cap'), '23514');
SELECT pg_temp.debe_fallar('monto negativo', pg_temp.ins(:c2, -5, 'PENDIENTE', 'm1', :'cap'), '23514');
SELECT pg_temp.debe_fallar('tipo de archivo no permitido', pg_temp.ins(:c2, 5, 'PENDIENTE', 'm2', :'cap', NULL, 'image/gif'), '23514');
SELECT pg_temp.debe_fallar('archivo de 0 bytes', pg_temp.ins(:c2, 5, 'PENDIENTE', 'm3', :'cap', NULL, 'image/png', 0), '23514');
SELECT pg_temp.debe_fallar('archivo de mas de 5 MiB', pg_temp.ins(:c2, 5, 'PENDIENTE', 'm4', :'cap', NULL, 'image/png', 5242881), '23514');
SELECT pg_temp.esperar('archivo de exactamente 5 MiB', pg_temp.filas(pg_temp.ins(:c2, 5, 'PENDIENTE', 'm5', :'cap', NULL, 'application/pdf', 5242880)), 1);
SELECT pg_temp.debe_fallar('estado fuera de la lista', pg_temp.ins(:c2, 5, 'ANULADO', 'm6', :'cap'), '22P02');
SELECT pg_temp.debe_fallar('cuota inexistente', pg_temp.ins(0, 5, 'PENDIENTE', 'm7', :'cap'), '23503');
SELECT pg_temp.debe_fallar('registrador inexistente', pg_temp.ins(:c2, 5, 'PENDIENTE', 'm8', gen_random_uuid()), '23503');
SELECT pg_temp.debe_fallar('misma clave de comprobante en otro pago', pg_temp.ins(:c2, 5, 'PENDIENTE', 'k1', :'cap'), '23505');
SELECT pg_temp.debe_fallar('misma clave de idempotencia del mismo usuario', pg_temp.ins(:c2, 5, 'PENDIENTE', 'm9', :'cap', 'idem-1'), '23505');
SELECT pg_temp.esperar('la misma clave de idempotencia con otro usuario', pg_temp.filas(pg_temp.ins(:c2, 5, 'PENDIENTE', 'm10', :'org', 'idem-1')), 1);
SELECT pg_temp.esperar('varios pagos sin clave de idempotencia', pg_temp.filas(pg_temp.ins(:c2, 5, 'PENDIENTE', 'm11', :'cap')) + pg_temp.filas(pg_temp.ins(:c2, 5, 'PENDIENTE', 'm12', :'cap')), 2);
SELECT pg_temp.debe_fallar('no se puede borrar una cuota con pagos', format('DELETE FROM cuota WHERE id=%s', :c1), '23503');
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan pagos ni cuotas', (SELECT count(*) FROM pago) + (SELECT count(*) FROM cuota), 0);
\echo 'Tabla pago y saldos (DB-13.1) verificados.'
