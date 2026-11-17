-- Verifica DB-1.4: seed consolidado (partidos Finalizados/En curso, estadisticas, cuotas y pagos de los equipos 1 a 6).
-- Requiere haber corrido `npm run db:seed`. Solo lee: no modifica nada.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h1-consolidado.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido numeric, esperado numeric) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp.esperar_txt(caso text, obtenido text, esperado text) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

SELECT id AS t FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT id AS tc FROM temporada WHERE nombre='Clausura 2025' \gset
SELECT array_agg(id ORDER BY id) AS eqs FROM (SELECT id FROM equipo WHERE temporada_id=:t AND estado='INSCRITO' ORDER BY id LIMIT 6) x \gset
SELECT (:'eqs'::int[])[1] AS e1, (:'eqs'::int[])[2] AS e2, (:'eqs'::int[])[3] AS e3, (:'eqs'::int[])[4] AS e4, (:'eqs'::int[])[5] AS e5, (:'eqs'::int[])[6] AS e6 \gset

-- ===== Partidos =====
SELECT pg_temp.esperar('Apertura: partidos Finalizados', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='FINALIZADO'), 18);
SELECT pg_temp.esperar('Apertura: partidos En curso', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='EN_CURSO'), 1);
SELECT pg_temp.esperar('Apertura: partidos Programados', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='PROGRAMADO'), 47);
SELECT pg_temp.esperar('Jornadas 1 a 3 solo tienen Finalizados', (SELECT count(*) FROM partido p JOIN jornada j ON j.id=p.jornada_id WHERE p.temporada_id=:t AND j.numero<=3 AND p.estado<>'FINALIZADO'), 0);
SELECT pg_temp.esperar('El En curso es de la jornada 4', (SELECT j.numero FROM partido p JOIN jornada j ON j.id=p.jornada_id WHERE p.temporada_id=:t AND p.estado='EN_CURSO'), 4);
SELECT pg_temp.esperar('Finalizados con inicio_real y fin_real', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='FINALIZADO' AND inicio_real IS NOT NULL AND fin_real > inicio_real), 18);
SELECT pg_temp.esperar('En curso con inicio_real y sin fin_real', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='EN_CURSO' AND inicio_real IS NOT NULL AND fin_real IS NULL), 1);
SELECT pg_temp.esperar('Programados sin marcador ni tiempos reales', (SELECT count(*) FROM partido WHERE temporada_id=:t AND estado='PROGRAMADO' AND (goles_local<>0 OR goles_visitante<>0 OR inicio_real IS NOT NULL OR fin_real IS NOT NULL)), 0);
SELECT pg_temp.esperar('Jornadas de Apertura siguen siendo 11', (SELECT count(*) FROM jornada WHERE temporada_id=:t), 11);
SELECT pg_temp.esperar('Equipos de Apertura intactos (13 con el Pendiente)', (SELECT count(*) FROM equipo WHERE temporada_id=:t), 13);

-- Clausura 2025
SELECT pg_temp.esperar('Clausura 2025: 1 jornada Publicada', (SELECT count(*) FROM jornada WHERE temporada_id=:tc AND numero=1 AND estado='PUBLICADA'), 1);
SELECT pg_temp.esperar('Clausura 2025: 2 partidos Finalizados', (SELECT count(*) FROM partido WHERE temporada_id=:tc AND estado='FINALIZADO'), 2);
SELECT pg_temp.esperar('Clausura 2025: no hay otros partidos', (SELECT count(*) FROM partido WHERE temporada_id=:tc), 2);

-- ===== Marcador = suma de estadisticas por lado (jugadores del equipo local / visitante) =====
SELECT pg_temp.esperar('Marcador local = goles de los jugadores locales (todos los Finalizados y En curso)', (
  SELECT count(*) FROM partido p WHERE p.estado IN ('FINALIZADO','EN_CURSO') AND p.goles_local <> COALESCE((
    SELECT sum(e.goles) FROM estadistica_partido e JOIN participacion_partido pp ON pp.partido_id=e.partido_id AND pp.jugador_id=e.jugador_id
    WHERE e.partido_id=p.id AND pp.equipo_id=p.equipo_local_id),0)), 0);
SELECT pg_temp.esperar('Marcador visitante = goles de los jugadores visitantes', (
  SELECT count(*) FROM partido p WHERE p.estado IN ('FINALIZADO','EN_CURSO') AND p.goles_visitante <> COALESCE((
    SELECT sum(e.goles) FROM estadistica_partido e JOIN participacion_partido pp ON pp.partido_id=e.partido_id AND pp.jugador_id=e.jugador_id
    WHERE e.partido_id=p.id AND pp.equipo_id=p.equipo_visitante_id),0)), 0);
SELECT pg_temp.esperar('Cada partido con resultado tiene 14 participantes (7 por equipo)', (
  SELECT count(*) FROM partido p WHERE p.estado IN ('FINALIZADO','EN_CURSO') AND (SELECT count(*) FROM participacion_partido WHERE partido_id=p.id) <> 14), 0);
SELECT pg_temp.esperar('Cada participante tiene su fila de estadistica', (
  SELECT count(*) FROM participacion_partido pp WHERE NOT EXISTS (SELECT 1 FROM estadistica_partido e WHERE e.partido_id=pp.partido_id AND e.jugador_id=pp.jugador_id)), 0);
SELECT pg_temp.esperar('Programados sin participantes ni estadisticas', (
  SELECT count(*) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.estado='PROGRAMADO'), 0);
SELECT pg_temp.esperar('Total de filas de estadistica (21 partidos x 14)', (SELECT count(*) FROM estadistica_partido), 294);

-- Fila previa de DB-9.1 conservada: partido 12 de Apertura, primer jugador local = 1 gol, 0 asistencias, 1 tarjeta
SELECT id AS p12 FROM partido WHERE temporada_id=:t ORDER BY id OFFSET 11 LIMIT 1 \gset
SELECT jugador_id AS jprim FROM equipo_jugador WHERE temporada_id=:t AND equipo_id=(SELECT equipo_local_id FROM partido WHERE id=:p12) ORDER BY jugador_id LIMIT 1 \gset
SELECT pg_temp.esperar_txt('Partido 12 / primer local: goles-asistencias-tarjetas',
  (SELECT goles||'-'||asistencias||'-'||tarjetas FROM estadistica_partido WHERE partido_id=:p12 AND jugador_id=:jprim), '1-0-1');

-- ===== Consistencia con H22 (agregados), H10 (goleadores) y la vista de pagos =====
SELECT pg_temp.esperar('H22: goles de la temporada = suma de marcadores Finalizados', (
  SELECT sum(e.goles) FROM estadistica_partido e JOIN partido p ON p.id=e.partido_id WHERE p.temporada_id=:t AND p.estado='FINALIZADO'),
  (SELECT sum(goles_local+goles_visitante) FROM partido WHERE temporada_id=:t AND estado='FINALIZADO'));
SELECT pg_temp.esperar('H10: nadie tiene mas goles que el total de la temporada', (
  SELECT count(*) FROM (SELECT jugador_id, sum(goles) g FROM estadistica_partido GROUP BY 1) x WHERE g > (SELECT sum(goles_local+goles_visitante) FROM partido WHERE estado='FINALIZADO')), 0);

-- ===== Cuotas y pagos (vista de H21) =====
SELECT pg_temp.esperar('Cuotas sembradas', (SELECT count(*) FROM cuota WHERE temporada_id=:t), 7);
SELECT pg_temp.esperar('Pagos sembrados', (SELECT count(*) FROM pago), 10);
SELECT pg_temp.esperar('Equipo 4 sin cuotas', (SELECT count(*) FROM cuota WHERE equipo_id=:e4), 0);
SELECT pg_temp.esperar('E1 inscripcion: pagada y sin saldo', (SELECT saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:e1 AND concepto='INSCRIPCION'), 0);
SELECT pg_temp.esperar('E1 arbitraje: 25.50 pagado y sin saldo', (SELECT pagado FROM v_estado_pagos_equipo WHERE equipo_id=:e1 AND concepto='ARBITRAJE'), 25.50);
SELECT pg_temp.esperar('E1 sin saldo ni vencimiento en ningun concepto', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:e1 AND (saldo_pendiente<>0 OR vencido_desde IS NOT NULL)), 0);
SELECT pg_temp.esperar('E2 saldo 60 con vencimiento futuro (no vencido)', (SELECT saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:e2), 60);
SELECT pg_temp.esperar('E2 sin vencido_desde', (SELECT count(*) FROM v_estado_pagos_equipo WHERE equipo_id=:e2 AND vencido_desde IS NOT NULL), 0);
SELECT pg_temp.esperar('E3 saldo 70 (el Pendiente de 50 no cuenta)', (SELECT saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:e3), 70);
SELECT pg_temp.esperar_txt('E3 vencido desde 2026-10-31', (SELECT vencido_desde::text FROM v_estado_pagos_equipo WHERE equipo_id=:e3), '2026-10-31');
SELECT pg_temp.esperar('E5 inscripcion 100 verificada', (SELECT pagado FROM v_estado_pagos_equipo WHERE equipo_id=:e5 AND concepto='INSCRIPCION'), 100);
SELECT pg_temp.esperar('E5 arbitraje: Pendiente y Rechazado no cuentan, saldo 25.50', (SELECT saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:e5 AND concepto='ARBITRAJE'), 25.50);
SELECT pg_temp.esperar('E5 H14: total de cuotas 125.50', (SELECT sum(monto) FROM cuota WHERE equipo_id=:e5), 125.50);
SELECT pg_temp.esperar('E5 H14: total de pagos registrados 135.50', (SELECT sum(p.monto) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5), 135.50);
SELECT pg_temp.esperar('E5 H14: verificado 100.00', (SELECT COALESCE(sum(p.monto),0) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5 AND p.estado='VERIFICADO'), 100.00);
SELECT pg_temp.esperar('E5 H14: pendiente 25.50', (SELECT COALESCE(sum(p.monto),0) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5 AND p.estado='PENDIENTE'), 25.50);
SELECT pg_temp.esperar('E5 H14: rechazado 10.00', (SELECT COALESCE(sum(p.monto),0) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5 AND p.estado='RECHAZADO'), 10.00);
SELECT pg_temp.esperar('E5 rechazado con motivo de 20+ caracteres', (SELECT count(*) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5 AND p.estado='RECHAZADO' AND length(btrim(p.motivo_rechazo))>=20), 1);
SELECT pg_temp.esperar('E6 saldo propio 23 (77 verificado; el Pendiente de 15 no cuenta)', (SELECT saldo_pendiente FROM v_estado_pagos_equipo WHERE equipo_id=:e6), 23);
SELECT pg_temp.esperar('Aislamiento: pagos de E6 no aparecen en cuotas de E5', (SELECT count(*) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE c.equipo_id=:e5 AND p.monto IN (77,15)), 0);
SELECT pg_temp.esperar('Cuotas de arbitraje apuntan a un partido Finalizado del equipo', (
  SELECT count(*) FROM cuota c JOIN partido p ON p.id=c.partido_id WHERE c.concepto='ARBITRAJE' AND p.estado='FINALIZADO' AND :e1 IN (p.equipo_local_id,p.equipo_visitante_id) AND c.equipo_id=:e1), 1);

-- fn_saldo_cuota coincide con la vista
SELECT pg_temp.esperar('fn_saldo_cuota (E3) = saldo de la vista', (SELECT s.saldo FROM fn_saldo_cuota((SELECT id FROM cuota WHERE equipo_id=:e3)) s), 70);
SELECT pg_temp.esperar('fn_saldo_cuota (E3): 50 pendiente de verificar', (SELECT s.pendiente_verificacion FROM fn_saldo_cuota((SELECT id FROM cuota WHERE equipo_id=:e3)) s), 50);

-- Bandeja de pendientes (H24): 3 pagos, el mas antiguo primero (E3, E5, E6)
SELECT pg_temp.esperar('Pagos Pendientes en total', (SELECT count(*) FROM pago WHERE estado='PENDIENTE'), 3);
SELECT pg_temp.esperar_txt('Orden de la bandeja por equipo', (
  SELECT string_agg(c.equipo_id::text, ',' ORDER BY p.creado_en, p.id) FROM pago p JOIN cuota c ON c.id=p.cuota_id WHERE p.estado='PENDIENTE'),
  :'e3'||','||:'e5'||','||:'e6');

-- Invariantes globales
SELECT pg_temp.esperar('Ningun pago supera su cuota (Pendiente+Verificado <= monto)', (
  SELECT count(*) FROM cuota c WHERE (SELECT COALESCE(sum(monto),0) FROM pago WHERE cuota_id=c.id AND estado IN ('PENDIENTE','VERIFICADO')) > c.monto), 0);
SELECT pg_temp.esperar('Posiciones no sembradas (las calcula BE-8.1)', (SELECT count(*) FROM posicion), 0);
