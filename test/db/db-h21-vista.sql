-- Verifica DB-21.1: vista v_estado_pagos_equipo (saldos y vencimientos de cuotas por equipo y concepto).
-- Requiere los seeds de H1 y DB-3.2. No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h21-vista.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido numeric, esperado numeric) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo THEN RAISE NOTICE 'OK    % (rechazado: %)', caso, SQLSTATE; RETURN; END IF;
    RAISE EXCEPTION 'FALLO %: fallo por otro motivo (%): %', caso, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO %: la sentencia NO fue rechazada', caso;
END $$ LANGUAGE plpgsql;

-- Registra un pago con los datos de decision que exige DB-24.1 cuando no esta PENDIENTE.
CREATE FUNCTION pg_temp.pago(p_cuota int, p_monto numeric, p_estado text, p_clave text) RETURNS void AS $$
DECLARE org uuid := (SELECT id FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1);
BEGIN
  INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,estado,registrado_por,verificado_por,verificado_en,motivo_rechazo)
  VALUES (p_cuota, p_monto, '2026-11-10', p_clave, 'image/png', 1000, p_estado::estado_pago, org,
          CASE WHEN p_estado <> 'PENDIENTE' THEN org END, CASE WHEN p_estado <> 'PENDIENTE' THEN now() END,
          CASE WHEN p_estado = 'RECHAZADO' THEN 'Comprobante ilegible o incompleto' END);
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('vista v_estado_pagos_equipo creada', (SELECT count(*) FROM information_schema.views WHERE table_name='v_estado_pagos_equipo'), 1);
SELECT pg_temp.esperar('indice ix_cuota_equipo_temporada (DB-14.1) disponible para la vista', (SELECT count(*) FROM pg_indexes WHERE indexname='ix_cuota_equipo_temporada'), 1);

BEGIN;
SELECT (now() AT TIME ZONE 'America/El_Salvador')::date AS hoy \gset
SELECT id AS t FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT array_agg(id ORDER BY id) AS eqs FROM (SELECT id FROM equipo WHERE temporada_id=:t AND estado='INSCRITO' ORDER BY id LIMIT 4) x \gset
SELECT (:'eqs'::int[])[1] AS ea, (:'eqs'::int[])[2] AS eb, (:'eqs'::int[])[3] AS ec, (:'eqs'::int[])[4] AS ed \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
-- Partidos de cada equipo (las cuotas de ARBITRAJE se asocian a un partido)
SELECT array_agg(id ORDER BY id) AS pa FROM (SELECT id FROM partido WHERE equipo_local_id=:ea ORDER BY id LIMIT 1) x \gset
SELECT array_agg(id ORDER BY id) AS pc FROM (SELECT id FROM partido WHERE equipo_local_id=:ec ORDER BY id LIMIT 3) x \gset

-- A: todo pagado y verificado. Inscripcion 100 (vencida hace 30 dias) y arbitraje 25.50
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t,:ea,'INSCRIPCION',100,:'hoy'::date-30,:'org') RETURNING id AS a1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (:t,:ea,'ARBITRAJE',(:'pa'::int[])[1],25.50,:'hoy'::date-10,:'org') RETURNING id AS a2 \gset
SELECT pg_temp.pago(:a1, 100, 'VERIFICADO', 'va1'); SELECT pg_temp.pago(:a2, 25.50, 'VERIFICADO', 'va2');
-- B: saldo con vencimiento futuro: inscripcion 100, verificado 40
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t,:eb,'INSCRIPCION',100,:'hoy'::date+30,:'org') RETURNING id AS b1 \gset
SELECT pg_temp.pago(:b1, 40, 'VERIFICADO', 'vb1');
-- C: saldo vencido. Inscripcion 100 (vence hace 20 dias): verificado 30, pendiente 50 y rechazado 20 (no reducen el saldo)
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t,:ec,'INSCRIPCION',100,:'hoy'::date-20,:'org') RETURNING id AS c1 \gset
SELECT pg_temp.pago(:c1, 30, 'VERIFICADO', 'vc1'); SELECT pg_temp.pago(:c1, 50, 'PENDIENTE', 'pc1'); SELECT pg_temp.pago(:c1, 20, 'RECHAZADO', 'rc1');
--    Tres cuotas de arbitraje: vence hace 40 dias (pagada), hace 15 (saldo 20) y hace 5 (saldo 25): el mas antiguo con saldo es hace 15
INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (:t,:ec,'ARBITRAJE',(:'pc'::int[])[1],25,:'hoy'::date-40,:'org') RETURNING id AS c2 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (:t,:ec,'ARBITRAJE',(:'pc'::int[])[2],30,:'hoy'::date-15,:'org') RETURNING id AS c3 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (:t,:ec,'ARBITRAJE',(:'pc'::int[])[3],25,:'hoy'::date-5,:'org') RETURNING id AS c4 \gset
SELECT pg_temp.pago(:c2, 25, 'VERIFICADO', 'vc2'); SELECT pg_temp.pago(:c3, 10, 'VERIFICADO', 'vc3');
-- D: sin cuotas.   E: equipo PENDIENTE de inscripcion con una cuota (no debe aparecer)
SELECT id AS ep, temporada_id AS tp FROM equipo WHERE estado='PENDIENTE' ORDER BY id LIMIT 1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:tp,:ep,'INSCRIPCION',100,:'hoy'::date+5,:'org');
SELECT id AS er FROM equipo WHERE estado='RECHAZADO' ORDER BY id LIMIT 1 \gset

-- ===== Equipo A: pagado completo =====
SELECT pg_temp.esperar('A: dos conceptos (INSCRIPCION y ARBITRAJE)', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ea), 2);
SELECT pg_temp.esperar('A inscripcion: total 100, pagado 100, saldo 0', (SELECT total_cuotas*10000 + pagado*100 + saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:ea AND concepto='INSCRIPCION'), 1000000 + 10000);
SELECT pg_temp.esperar('A arbitraje: total 25.50 = pagado 25.50, saldo 0', (SELECT (total_cuotas = 25.50 AND pagado = 25.50 AND saldo_pendiente = 0)::int FROM v_estado_pagos_equipo WHERE equipo_id=:ea AND concepto='ARBITRAJE'), 1);
SELECT pg_temp.esperar('A: aunque su cuota vencio, sin saldo no hay vencido_desde', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ea AND vencido_desde IS NOT NULL), 0);

-- ===== Equipo B: saldo con vencimiento futuro =====
SELECT pg_temp.esperar('B: una fila, total 100, pagado 40, saldo 60', (SELECT count(*)::numeric*1000000 + total_cuotas*10000 + pagado*100 + saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:eb GROUP BY total_cuotas, pagado, saldo_pendiente), 1000000 + 1000000 + 4000 + 60);
SELECT pg_temp.esperar('B: vencimiento futuro => vencido_desde nulo', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:eb AND vencido_desde IS NOT NULL), 0);

-- ===== Equipo C: saldo vencido =====
SELECT pg_temp.esperar('C inscripcion: pagado 30 (el pendiente de 50 y el rechazado de 20 no cuentan), saldo 70', (SELECT pagado*100 + saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND concepto='INSCRIPCION'), 3070);
SELECT pg_temp.esperar('C inscripcion: vencido_desde = hace 20 dias', (SELECT (vencido_desde = :'hoy'::date-20)::int FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND concepto='INSCRIPCION'), 1);
SELECT pg_temp.esperar('C arbitraje: 3 cuotas suman total 80, pagado 35, saldo 45', (SELECT total_cuotas*10000 + pagado*100 + saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND concepto='ARBITRAJE'), 800000 + 3500 + 45);
SELECT pg_temp.esperar('C arbitraje: vencido_desde = la mas antigua CON saldo (hace 15, no la pagada de hace 40)', (SELECT (vencido_desde = :'hoy'::date-15)::int FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND concepto='ARBITRAJE'), 1);

-- ===== Equipo D: sin cuotas =====
SELECT pg_temp.esperar('D: una sola fila', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ed), 1);
SELECT pg_temp.esperar('D: concepto nulo y montos en 0', (SELECT (concepto IS NULL AND total_cuotas = 0 AND pagado = 0 AND saldo_pendiente = 0)::int FROM v_estado_pagos_equipo WHERE equipo_id=:ed), 1);
SELECT pg_temp.esperar('D: vencido_desde nulo', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ed AND vencido_desde IS NOT NULL), 0);

-- ===== Solo el equipo C devuelve vencido_desde =====
SELECT pg_temp.esperar('de los 4 equipos solo C tiene vencido_desde', (SELECT count(DISTINCT equipo_id) FROM v_estado_pagos_equipo WHERE equipo_id IN (:ea,:eb,:ec,:ed) AND vencido_desde IS NOT NULL), 1);
SELECT pg_temp.esperar('...y ese equipo es C', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND vencido_desde IS NOT NULL), 2);

-- ===== Solo equipos inscritos =====
SELECT pg_temp.esperar('un equipo PENDIENTE no aparece (aunque tenga cuota)', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ep), 0);
SELECT pg_temp.esperar('un equipo RECHAZADO no aparece', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:er), 0);
SELECT pg_temp.esperar('solo aparecen equipos con estado INSCRITO', (SELECT count(*) FROM v_estado_pagos_equipo v JOIN equipo e ON e.id=v.equipo_id WHERE e.estado <> 'INSCRITO'), 0);

-- ===== Coherencia con fn_saldo_cuota (DB-13.1): el saldo es el mismo calculo =====
SELECT pg_temp.esperar('el saldo de la vista = suma de fn_saldo_cuota por cuota (equipo C)',
  (SELECT sum(saldo_pendiente) FROM v_estado_pagos_equipo WHERE equipo_id=:ec) - (SELECT sum(f.saldo) FROM cuota c, LATERAL fn_saldo_cuota(c.id) f WHERE c.equipo_id=:ec), 0);
SELECT pg_temp.esperar('total_cuotas = pagado + saldo_pendiente en cada fila', (SELECT count(*) FROM v_estado_pagos_equipo WHERE total_cuotas <> pagado + saldo_pendiente), 0);

-- ===== "Hoy" en America/El_Salvador: una cuota que vence hoy aun no esta vencida; la de ayer si =====
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t,:ed,'INSCRIPCION',50,:'hoy'::date,:'org') RETURNING id AS d1 \gset
SELECT pg_temp.esperar('vence hoy (hora de El Salvador): todavia no esta vencida', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ed AND vencido_desde IS NOT NULL), 0);
UPDATE cuota SET fecha_vencimiento = :'hoy'::date - 1 WHERE id = :d1;
SELECT pg_temp.esperar('venció ayer: vencido_desde = ayer', (SELECT (vencido_desde = :'hoy'::date - 1)::int FROM v_estado_pagos_equipo WHERE equipo_id=:ed AND concepto='INSCRIPCION'), 1);
SELECT pg_temp.esperar('D ya tiene concepto: desaparece la fila de "sin cuotas"', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:ed AND concepto IS NULL), 0);

-- ===== Efecto de verificar el pendiente de C (50): baja el saldo =====
UPDATE pago SET estado='VERIFICADO', verificado_por=:'org', verificado_en=now() WHERE comprobante_clave='pc1';
SELECT pg_temp.esperar('al verificarse el pendiente de 50, C inscripcion queda en pagado 80 (30+50; el rechazado de 20 sigue sin contar), saldo 20', (SELECT pagado*100 + saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:ec AND concepto='INSCRIPCION'), 8020);
-- ===== Solo lectura =====
SELECT pg_temp.debe_fallar('INSERT sobre la vista', format('INSERT INTO v_estado_pagos_equipo(temporada_id,equipo_id,nombre) VALUES (%s,%s,''x'')', :t, :ea), '55000');
SELECT pg_temp.debe_fallar('UPDATE sobre la vista', 'UPDATE v_estado_pagos_equipo SET pagado = 999', '55000');
SELECT pg_temp.debe_fallar('DELETE sobre la vista', 'DELETE FROM v_estado_pagos_equipo', '55000');
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan cuotas ni pagos', (SELECT count(*) FROM cuota) + (SELECT count(*) FROM pago), 0);
\echo 'Vista v_estado_pagos_equipo (DB-21.1) verificada.'
