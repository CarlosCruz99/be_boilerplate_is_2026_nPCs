-- Verifica DB-14.1: consultas del historial de pagos de un equipo (H14) e indice ix_cuota_equipo_temporada.
-- Requiere los seeds de H1 y DB-3.2. No deja datos: todo corre en transacciones que se revierten.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h14-historial.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido numeric, esperado numeric) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.pago(p_cuota int, p_monto numeric, p_estado text, p_clave text, p_fecha date) RETURNS void AS $$
DECLARE org uuid := (SELECT id FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1);
BEGIN
  INSERT INTO pago(cuota_id,monto,fecha_pago,comprobante_clave,comprobante_mime,comprobante_bytes,estado,registrado_por,verificado_por,verificado_en,motivo_rechazo)
  VALUES (p_cuota, p_monto, p_fecha, p_clave, 'image/png', 1000, p_estado::estado_pago, org,
          CASE WHEN p_estado <> 'PENDIENTE' THEN org END, CASE WHEN p_estado <> 'PENDIENTE' THEN now() END,
          CASE WHEN p_estado = 'RECHAZADO' THEN 'Comprobante ilegible o incompleto' END);
END $$ LANGUAGE plpgsql;

-- ===== Las tres consultas de H14 (p_equipo, p_temporada, p_concepto y p_usuario son parametros) =====
-- 1) Autorizacion: sin filas = el equipo no existe en esa temporada (404); true/false = es o no su capitan JUGADOR (403).
CREATE FUNCTION pg_temp.autorizado(p_equipo int, p_temporada int, p_usuario uuid) RETURNS TABLE (autorizado boolean) AS $$
  SELECT COALESCE(e.capitan_id = u.id AND u.rol = 'JUGADOR', false)
  FROM equipo e LEFT JOIN usuario u ON u.id = p_usuario
  WHERE e.id = p_equipo AND e.temporada_id = p_temporada
$$ LANGUAGE sql STABLE;
-- 2) Lista: todos los pagos filtrados; los metadatos del comprobante salen de la misma fila (no hay join que duplique)
--    y la clave privada NO se selecciona.
CREATE FUNCTION pg_temp.historial(p_equipo int, p_temporada int, p_concepto text DEFAULT NULL)
RETURNS TABLE (id int, cuota_id int, concepto concepto_cuota, monto numeric, fecha_pago date, estado estado_pago, motivo_rechazo text, comprobante_mime varchar, comprobante_bytes int) AS $$
  SELECT p.id, p.cuota_id, c.concepto, p.monto, p.fecha_pago, p.estado, p.motivo_rechazo, p.comprobante_mime, p.comprobante_bytes
  FROM pago p JOIN cuota c ON c.id = p.cuota_id
  WHERE c.equipo_id = p_equipo AND c.temporada_id = p_temporada
    AND (p_concepto IS NULL OR c.concepto = p_concepto::concepto_cuota)
  ORDER BY p.fecha_pago DESC, p.id DESC
$$ LANGUAGE sql STABLE;
-- 3) Totales: cuatro sumas sobre el MISMO conjunto (mismo FROM y WHERE), siempre una fila.
CREATE FUNCTION pg_temp.totales(p_equipo int, p_temporada int, p_concepto text DEFAULT NULL)
RETURNS TABLE (total_registrado numeric, total_verificado numeric, pendiente_verificacion numeric, total_rechazado numeric) AS $$
  SELECT COALESCE(SUM(p.monto), 0),
         COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'VERIFICADO'), 0),
         COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'PENDIENTE'), 0),
         COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'RECHAZADO'), 0)
  FROM pago p JOIN cuota c ON c.id = p.cuota_id
  WHERE c.equipo_id = p_equipo AND c.temporada_id = p_temporada
    AND (p_concepto IS NULL OR c.concepto = p_concepto::concepto_cuota)
$$ LANGUAGE sql STABLE;

SELECT pg_temp.esperar('indice ix_cuota_equipo_temporada (equipo_id, temporada_id)', (SELECT count(*) FROM pg_indexes
  WHERE tablename='cuota' AND indexname='ix_cuota_equipo_temporada' AND indexdef LIKE '%(equipo_id, temporada_id)'), 1);
SELECT pg_temp.esperar('la lista no selecciona comprobante_clave (clave privada)', (position('comprobante_clave' in pg_get_function_result('pg_temp.historial(int,int,text)'::regprocedure)) > 0)::int, 0);

BEGIN;
SELECT id AS t1 FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT array_agg(id ORDER BY id) AS eqs FROM (SELECT id FROM equipo WHERE temporada_id=:t1 AND estado='INSCRITO' ORDER BY id LIMIT 3) x \gset
SELECT (:'eqs'::int[])[1] AS e1, (:'eqs'::int[])[2] AS e2, (:'eqs'::int[])[3] AS e4 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
SELECT array_agg(id ORDER BY id) AS p1s FROM (SELECT id FROM partido WHERE equipo_local_id=:e1 ORDER BY id LIMIT 1) x \gset
-- otra temporada y su equipo (T2/E3)
SELECT t.id AS t2, e.id AS e3 FROM temporada t JOIN equipo e ON e.temporada_id=t.id AND e.estado='INSCRITO' WHERE t.id <> :t1 ORDER BY t.id, e.id LIMIT 1 \gset

-- T1/E1: inscripcion 100 (verificado), arbitraje 25.50 (pendiente 25.50 y rechazado 10)
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e1,'INSCRIPCION',100,'2026-12-31',:'org') RETURNING id AS q1 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,partido_id,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e1,'ARBITRAJE',(:'p1s'::int[])[1],25.50,'2026-12-31',:'org') RETURNING id AS q2 \gset
SELECT pg_temp.pago(:q1, 100.00, 'VERIFICADO', 'h1', '2026-11-01');
SELECT pg_temp.pago(:q2, 25.50, 'PENDIENTE', 'h2', '2026-11-12');
SELECT pg_temp.pago(:q2, 10.00, 'RECHAZADO', 'h3', '2026-11-12');   -- misma fecha que el anterior: desempata pago.id DESC
-- Aislamiento: E2 (misma temporada) y T2/E3 (otra temporada) con sus propios pagos
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t1,:e2,'INSCRIPCION',100,'2026-12-31',:'org') RETURNING id AS q3 \gset
INSERT INTO cuota(temporada_id,equipo_id,concepto,monto,fecha_vencimiento,creado_por) VALUES (:t2,:e3,'INSCRIPCION',80,'2026-12-31',:'org') RETURNING id AS q4 \gset
SELECT pg_temp.pago(:q3, 77.00, 'VERIFICADO', 'h4', '2026-11-05');
SELECT pg_temp.pago(:q4, 55.00, 'VERIFICADO', 'h5', '2026-11-06');

-- ===== Totales del conjunto de prueba T1/E1 =====
SELECT pg_temp.esperar('totalRegistrado = 135.50', (SELECT total_registrado FROM pg_temp.totales(:e1, :t1)), 135.50);
SELECT pg_temp.esperar('totalVerificado = 100.00', (SELECT total_verificado FROM pg_temp.totales(:e1, :t1)), 100.00);
SELECT pg_temp.esperar('pendienteVerificacion = 25.50', (SELECT pendiente_verificacion FROM pg_temp.totales(:e1, :t1)), 25.50);
SELECT pg_temp.esperar('totalRechazado = 10.00', (SELECT total_rechazado FROM pg_temp.totales(:e1, :t1)), 10.00);
SELECT pg_temp.esperar('pendientes y rechazados no aumentan totalVerificado (135.50 - 100.00 = 35.50 que no es dinero confirmado)', (SELECT total_registrado - total_verificado FROM pg_temp.totales(:e1, :t1)), 35.50);
SELECT pg_temp.esperar('siempre una sola fila de totales', (SELECT count(*) FROM pg_temp.totales(:e1, :t1)), 1);

-- ===== Lista: orden, sin duplicar, sin clave =====
SELECT pg_temp.esperar('lista: 3 pagos', (SELECT count(*) FROM pg_temp.historial(:e1, :t1)), 3);
SELECT pg_temp.esperar('lista: no duplica pagos (un pago, una fila)', (SELECT count(*) - count(DISTINCT id) FROM pg_temp.historial(:e1, :t1)), 0);
SELECT pg_temp.esperar('lista: orden fecha_pago DESC, id DESC (rechazado, pendiente, verificado)',
  (SELECT (array_agg(p.comprobante_clave::text ORDER BY h.ord) = ARRAY['h3','h2','h1'])::int
   FROM (SELECT id, row_number() OVER () AS ord FROM pg_temp.historial(:e1, :t1)) h JOIN pago p ON p.id = h.id), 1);
SELECT pg_temp.esperar('lista: el rechazado trae su motivo', (SELECT count(*) FROM pg_temp.historial(:e1, :t1) WHERE estado='RECHAZADO' AND char_length(motivo_rechazo) >= 20), 1);
SELECT pg_temp.esperar('lista: verificado y pendiente sin motivo', (SELECT count(*) FROM pg_temp.historial(:e1, :t1) WHERE estado <> 'RECHAZADO' AND motivo_rechazo IS NOT NULL), 0);
SELECT pg_temp.esperar('lista: trae mime y tamano del comprobante', (SELECT count(*) FROM pg_temp.historial(:e1, :t1) WHERE comprobante_mime = 'image/png' AND comprobante_bytes = 1000), 3);
SELECT pg_temp.esperar('lista y totales coinciden (suma de la lista = totalRegistrado)', (SELECT sum(monto) FROM pg_temp.historial(:e1, :t1)) - (SELECT total_registrado FROM pg_temp.totales(:e1, :t1)), 0);

-- ===== Filtro por concepto: lista y totales por igual =====
SELECT pg_temp.esperar('concepto INSCRIPCION: 1 pago', (SELECT count(*) FROM pg_temp.historial(:e1, :t1, 'INSCRIPCION')), 1);
SELECT pg_temp.esperar('concepto INSCRIPCION: totales 100 / 100 / 0 / 0', (SELECT total_registrado*1000000 + total_verificado*10000 + pendiente_verificacion*100 + total_rechazado FROM pg_temp.totales(:e1, :t1, 'INSCRIPCION')), 100*1000000 + 100*10000);
SELECT pg_temp.esperar('concepto ARBITRAJE: 2 pagos', (SELECT count(*) FROM pg_temp.historial(:e1, :t1, 'ARBITRAJE')), 2);
SELECT pg_temp.esperar('concepto ARBITRAJE: totales 35.50 / 0 / 25.50 / 10.00', (SELECT (total_registrado = 35.50 AND total_verificado = 0 AND pendiente_verificacion = 25.50 AND total_rechazado = 10.00)::int FROM pg_temp.totales(:e1, :t1, 'ARBITRAJE')), 1);
SELECT pg_temp.esperar('con filtro, lista y totales siguen coincidiendo (ARBITRAJE)', (SELECT sum(monto) FROM pg_temp.historial(:e1, :t1, 'ARBITRAJE')) - (SELECT total_registrado FROM pg_temp.totales(:e1, :t1, 'ARBITRAJE')), 0);

-- ===== Aislamiento: otro equipo, otra temporada =====
SELECT pg_temp.esperar('E2 (misma temporada) ve solo lo suyo: 77.00', (SELECT total_verificado FROM pg_temp.totales(:e2, :t1)), 77.00);
SELECT pg_temp.esperar('E2: su lista tiene 1 pago', (SELECT count(*) FROM pg_temp.historial(:e2, :t1)), 1);
SELECT pg_temp.esperar('T2/E3 (otra temporada) ve solo lo suyo: 55.00', (SELECT total_verificado FROM pg_temp.totales(:e3, :t2)), 55.00);
SELECT pg_temp.esperar('E1 con la temporada equivocada: lista vacia', (SELECT count(*) FROM pg_temp.historial(:e1, :t2)), 0);
SELECT pg_temp.esperar('E1 con la temporada equivocada: cuatro ceros', (SELECT total_registrado + total_verificado + pendiente_verificacion + total_rechazado FROM pg_temp.totales(:e1, :t2)), 0);
SELECT pg_temp.esperar('E1 no arrastra pagos de E2 ni de T2 (sigue en 135.50)', (SELECT total_registrado FROM pg_temp.totales(:e1, :t1)), 135.50);

-- ===== Sin filas: lista vacia y cuatro ceros =====
SELECT pg_temp.esperar('equipo sin cuotas: lista vacia', (SELECT count(*) FROM pg_temp.historial(:e4, :t1)), 0);
SELECT pg_temp.esperar('equipo sin cuotas: cuatro ceros', (SELECT total_registrado*1000000 + total_verificado*10000 + pendiente_verificacion*100 + total_rechazado FROM pg_temp.totales(:e4, :t1)), 0);

-- ===== Autorizacion: capitan con rol JUGADOR =====
SELECT capitan_id AS cap1 FROM equipo WHERE id = :e1 \gset
SELECT capitan_id AS cap2 FROM equipo WHERE id = :e2 \gset
SELECT pg_temp.esperar('el capitan de E1 (JUGADOR) esta autorizado', (SELECT autorizado::int FROM pg_temp.autorizado(:e1, :t1, :'cap1')), 1);
SELECT pg_temp.esperar('el capitan de E2 NO esta autorizado sobre E1', (SELECT autorizado::int FROM pg_temp.autorizado(:e1, :t1, :'cap2')), 0);
SELECT pg_temp.esperar('el organizador NO esta autorizado', (SELECT autorizado::int FROM pg_temp.autorizado(:e1, :t1, :'org')), 0);
SELECT pg_temp.esperar('un usuario inexistente NO esta autorizado', (SELECT autorizado::int FROM pg_temp.autorizado(:e1, :t1, '00000000-0000-0000-0000-000000000000')), 0);
SELECT pg_temp.esperar('equipo inexistente: sin filas (404)', (SELECT count(*) FROM pg_temp.autorizado(0, :t1, :'cap1')), 0);
SELECT pg_temp.esperar('equipo en otra temporada: sin filas (404)', (SELECT count(*) FROM pg_temp.autorizado(:e1, :t2, :'cap1')), 0);
-- El rol se lee de la base: si el capitan registrado tuviera rol distinto de JUGADOR, no se autoriza
SELECT id AS arb FROM usuario WHERE rol='ARBITRO' ORDER BY email LIMIT 1 \gset
UPDATE equipo SET capitan_id = :'arb' WHERE id = :e1;
SELECT pg_temp.esperar('capitan con rol ARBITRO (no JUGADOR): no autorizado', (SELECT autorizado::int FROM pg_temp.autorizado(:e1, :t1, :'arb')), 0);
ROLLBACK;

-- ===== EXPLAIN: el indice de cuotas por equipo y temporada =====
\echo
\echo '=== EXPLAIN: cuotas de un equipo en una temporada (copia escalada de 60 mil cuotas) ==='
\echo 'La tabla real tiene pocas filas y PostgreSQL la lee completa; con el volumen de una liga grande se ve el indice nuevo.'
CREATE FUNCTION pg_temp.plan_cuotas() RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  FOR linea IN EXECUTE 'EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) SELECT id, concepto, monto FROM cuota_escala WHERE equipo_id = 5 AND temporada_id = 5' LOOP
    res := res || linea || E'\n';
  END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;
BEGIN;
CREATE TEMP TABLE cuota_escala ON COMMIT DROP AS
  SELECT g AS id, (g % 3000) + 1 AS equipo_id, (g % 8) + 1 AS temporada_id, 'INSCRIPCION'::concepto_cuota AS concepto, 100::numeric AS monto FROM generate_series(1, 60000) g;
CREATE INDEX ix_escala_cuota ON cuota_escala (equipo_id, temporada_id);
ANALYZE cuota_escala;
SELECT pg_temp.plan_cuotas() AS plan_c \gset
COMMIT;
\echo :plan_c
SELECT pg_temp.esperar('buscar cuotas por equipo y temporada usa el indice', (position('ix_escala_cuota' in :'plan_c') > 0)::int, 1);
SELECT pg_temp.esperar('...sin recorrer la tabla completa', (position('Seq Scan' in :'plan_c') = 0)::int, 1);

SELECT pg_temp.esperar('despues de las pruebas no quedan pagos', (SELECT count(*) FROM pago), 0);
\echo 'Consultas del historial de pagos (DB-14.1) verificadas.'
