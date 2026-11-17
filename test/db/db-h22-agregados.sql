-- Verifica DB-22.1: consulta de indicadores oficiales de una temporada (H22): partidos, goles, tarjetas y asistencias.
-- Sin cambios de esquema (usa partido y estadistica_partido). Requiere los seeds de H1 y DB-3.2.
-- No deja datos: todo corre en transacciones que se revierten.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h22-agregados.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido numeric, esperado numeric) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- ===== La consulta de H22 (p_temporada es parametro) =====
-- Un solo SELECT: los cuatro agregados salen de la misma instantanea. Los goles se suman sobre partido (conjunto oficial)
-- y NUNCA se unen a las filas de estadistica_partido; tarjetas y asistencias salen de estadistica_partido unida solo
-- al conjunto oficial. Sin partidos: cuatro ceros.
CREATE FUNCTION pg_temp.indicadores(p_temporada int)
RETURNS TABLE (total_partidos int, total_goles int, total_tarjetas int, total_asistencias int) AS $$
  WITH oficial AS (
    SELECT id, goles_local, goles_visitante FROM partido WHERE temporada_id = p_temporada AND estado = 'FINALIZADO'
  )
  SELECT (SELECT COUNT(*) FROM oficial)::int,
         (SELECT COALESCE(SUM(goles_local + goles_visitante), 0) FROM oficial)::int,
         (SELECT COALESCE(SUM(e.tarjetas), 0) FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int,
         (SELECT COALESCE(SUM(e.asistencias), 0) FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int
$$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp.resumen(p_temporada int) RETURNS text AS $$
  SELECT total_partidos || '/' || total_goles || '/' || total_tarjetas || '/' || total_asistencias FROM pg_temp.indicadores(p_temporada)
$$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp.igual(caso text, obtenido text, esperado text) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.resumen((SELECT id FROM temporada WHERE nombre='Apertura 2026')) AS res0 \gset
BEGIN;
-- Linea base vacia DENTRO de esta transaccion: el seed consolidado (DB-1.4) deja pagos, cuotas, estadisticas y partidos
-- Finalizados que estas pruebas no esperan. Todo se restaura con el ROLLBACK final.
DELETE FROM pago; DELETE FROM cuota; DELETE FROM estadistica_partido; DELETE FROM participacion_partido;
UPDATE partido SET estado='PROGRAMADO', goles_local=0, goles_visitante=0, faltas_local=0, faltas_visitante=0, inicio_real=NULL, fin_real=NULL WHERE estado<>'PROGRAMADO';
DELETE FROM partido WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025'); DELETE FROM jornada WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025');
SELECT id AS t1 FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT equipo_id AS eq FROM equipo_jugador WHERE temporada_id=:t1 GROUP BY equipo_id HAVING count(*) >= 8 ORDER BY equipo_id LIMIT 1 \gset
SELECT array_agg(jugador_id ORDER BY jugador_id) AS js FROM (SELECT jugador_id FROM equipo_jugador WHERE equipo_id=:eq ORDER BY jugador_id LIMIT 8) x \gset
SELECT (:'js'::int[])[1] AS ja, (:'js'::int[])[2] AS jb, (:'js'::int[])[3] AS jc, (:'js'::int[])[4] AS jd, (:'js'::int[])[5] AS je, (:'js'::int[])[6] AS jf, (:'js'::int[])[7] AS jg, (:'js'::int[])[8] AS jh \gset
SELECT array_agg(id ORDER BY inicio) AS ms FROM (SELECT id, inicio FROM partido WHERE temporada_id=:t1 AND (equipo_local_id=:eq OR equipo_visitante_id=:eq) AND estado='PROGRAMADO' ORDER BY inicio LIMIT 6) x \gset
SELECT (:'ms'::int[])[1] AS p1, (:'ms'::int[])[2] AS p2, (:'ms'::int[])[3] AS p3, (:'ms'::int[])[4] AS p4, (:'ms'::int[])[5] AS p5, (:'ms'::int[])[6] AS p6 \gset

SELECT pg_temp.igual('sin partidos oficiales: cuatro ceros (una fila)', (SELECT pg_temp.resumen(:t1)), '0/0/0/0');
SELECT pg_temp.igual('temporada inexistente: cuatro ceros', (SELECT pg_temp.resumen(0)), '0/0/0/0');
SELECT pg_temp.esperar('siempre una sola fila', (SELECT count(*) FROM pg_temp.indicadores(:t1)), 1);

-- P1 Finalizado 2-1, P2 Finalizado 0-0. P3 Programado, P4 En curso, P5 Cancelado: con marcadores y estadisticas que NO deben contar
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id IN (:p1,:p2,:p4);
UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=2, goles_visitante=1 WHERE id=:p1;
UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=0, goles_visitante=0 WHERE id=:p2;
UPDATE partido SET goles_local=4, goles_visitante=4 WHERE id=:p4;                 -- En curso con marcador parcial
UPDATE partido SET goles_local=6, goles_visitante=6 WHERE id=:p3;                 -- Programado con goles (dato espurio)
UPDATE partido SET estado='CANCELADO', goles_local=3, goles_visitante=3 WHERE id=:p5;
--                                            tarjetas asistencias
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,tarjetas,asistencias) VALUES
  (:p1,:ja,2,2,1), (:p1,:jb,0,1,1), (:p1,:jc,0,0,0),            -- P1: 3 tarjetas y 2 asistencias (jc con cero tarjetas)
  (:p2,:ja,0,1,1), (:p2,:jb,0,0,0),                             -- P2: 1 tarjeta y 1 asistencia
  (:p3,:jc,0,9,9), (:p4,:jc,0,9,9), (:p5,:jc,0,9,9);            -- excluidos: Programado, En curso y Cancelado

-- Otro Finalizado, de otra temporada: excluido
SELECT t.id AS t2 FROM temporada t WHERE t.nombre <> 'Apertura 2026' AND (SELECT count(DISTINCT equipo_id) FROM equipo_jugador WHERE temporada_id=t.id) >= 2 ORDER BY t.id LIMIT 1 \gset
SELECT id AS ea FROM equipo WHERE temporada_id=:t2 ORDER BY id LIMIT 1 \gset
SELECT id AS eb FROM equipo WHERE temporada_id=:t2 AND id<>:ea ORDER BY id LIMIT 1 \gset
INSERT INTO jornada(temporada_id,numero,estado) VALUES (:t2,1,'BORRADOR') RETURNING id AS j2 \gset
SELECT cancha_id AS cn, arbitro_id AS ar, (fin-inicio) AS dur FROM partido ORDER BY id LIMIT 1 \gset
INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado)
  VALUES (:t2,:j2,:ea,:eb,:cn,:'ar',timestamptz '2027-03-01 15:00+00',timestamptz '2027-03-01 15:00+00'+:'dur'::interval,'PROGRAMADO') RETURNING id AS pz \gset
INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (:ea,:jh,:t2);
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,tarjetas,asistencias) VALUES (:pz,:jh,5,7,7);
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:pz;
UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=3, goles_visitante=2 WHERE id=:pz;

-- ===== Conjunto de prueba de la especificacion: 2 partidos, 3 goles, 4 tarjetas, 3 asistencias =====
SELECT pg_temp.esperar('totalPartidos = 2', (SELECT total_partidos FROM pg_temp.indicadores(:t1)), 2);
SELECT pg_temp.esperar('totalGoles = 3 (2-1 y 0-0)', (SELECT total_goles FROM pg_temp.indicadores(:t1)), 3);
SELECT pg_temp.esperar('totalTarjetas = 4 (3 + 1)', (SELECT total_tarjetas FROM pg_temp.indicadores(:t1)), 4);
SELECT pg_temp.esperar('totalAsistencias = 3 (2 + 1)', (SELECT total_asistencias FROM pg_temp.indicadores(:t1)), 3);
SELECT pg_temp.igual('resumen T1', (SELECT pg_temp.resumen(:t1)), '2/3/4/3');

-- ===== Exclusiones =====
SELECT pg_temp.esperar('Programado, En curso y Cancelado (con goles y 9 tarjetas) no cuentan', (SELECT total_partidos*100 + total_tarjetas FROM pg_temp.indicadores(:t1)), 204);
SELECT pg_temp.igual('otra temporada: su propio Finalizado (1 partido, 5 goles, 7 tarjetas, 7 asistencias)', (SELECT pg_temp.resumen(:t2)), '1/5/7/7');
SELECT pg_temp.igual('T1 no arrastra el Finalizado de T2', (SELECT pg_temp.resumen(:t1)), '2/3/4/3');

-- ===== Sin multiplicaciones: mas filas de estadistica no cambian partidos ni goles =====
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,tarjetas,asistencias) VALUES
  (:p1,:jd,0,0,0), (:p1,:je,0,0,0), (:p1,:jf,0,0,0), (:p1,:jg,0,0,0), (:p1,:jh,0,0,0),
  (:p2,:jc,0,0,0), (:p2,:jd,0,0,0), (:p2,:je,0,0,0);
SELECT pg_temp.igual('8 filas mas con cero tarjetas: mismos 2 partidos, 3 goles, 4 tarjetas, 3 asistencias', (SELECT pg_temp.resumen(:t1)), '2/3/4/3');
-- Un partido Finalizado SIN ninguna fila de estadistica cuenta como partido y aporta sus goles (no se pierde por un JOIN)
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:p6;
UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=1, goles_visitante=0 WHERE id=:p6;
SELECT pg_temp.igual('un Finalizado sin estadisticas suma partido y gol (3/4) y ninguna tarjeta mas', (SELECT pg_temp.resumen(:t1)), '3/4/4/3');

-- ===== Una correccion (H23) actualiza partido y estadistica_partido: el reporte lo refleja =====
UPDATE partido SET goles_local=3, goles_visitante=1 WHERE id=:p1;           -- 2-1 pasa a 3-1
UPDATE estadistica_partido SET tarjetas=0 WHERE partido_id=:p1 AND jugador_id=:ja;   -- 2 tarjetas pasan a 0
SELECT pg_temp.igual('tras la correccion: 3 partidos, 5 goles, 2 tarjetas, 3 asistencias', (SELECT pg_temp.resumen(:t1)), '3/5/2/3');
UPDATE partido SET estado='CANCELADO', fin_real=NULL, inicio_real=NULL WHERE id=:p6;
SELECT pg_temp.igual('un partido que deja de estar Finalizado sale del reporte', (SELECT pg_temp.resumen(:t1)), '2/4/2/3');
ROLLBACK;

SELECT pg_temp.igual('despues del ROLLBACK la temporada vuelve a lo que tenia (el seed)', (SELECT pg_temp.resumen((SELECT id FROM temporada WHERE nombre='Apertura 2026'))), :'res0');

-- ===== EXPLAIN: sin indice nuevo (copia escalada de ~20 mil partidos en 300 temporadas) =====
\echo
\echo '=== EXPLAIN del conjunto oficial (copia escalada: 300 temporadas x 66 partidos) ==='
CREATE FUNCTION pg_temp.plan_oficial() RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  FOR linea IN EXECUTE $q$EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
    SELECT COUNT(*), COALESCE(SUM(goles_local + goles_visitante), 0) FROM partido_esc WHERE temporada_id = 150 AND estado = 'FINALIZADO'$q$ LOOP
    res := res || linea || E'\n';
  END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;
BEGIN;
CREATE TEMP TABLE partido_esc ON COMMIT DROP AS SELECT * FROM partido;
INSERT INTO partido_esc SELECT p.* FROM partido p, generate_series(1, 299) g;
UPDATE partido_esc SET temporada_id = 1 + (ctid::text::point)[0]::int % 300 + 0 * (ctid::text::point)[1]::int;
UPDATE partido_esc SET estado = (CASE WHEN id % 4 = 0 THEN 'FINALIZADO' ELSE 'PROGRAMADO' END)::estado_partido, inicio_real = NULL, fin_real = NULL;
CREATE INDEX ix_esc_temporada_jornada ON partido_esc (temporada_id, jornada_id);
ANALYZE partido_esc;
SELECT count(*) AS filas_esc FROM partido_esc \gset
SELECT pg_temp.plan_oficial() AS plan_o \gset
COMMIT;
\echo :plan_o
SELECT pg_temp.esperar('la copia escalada tiene volumen (> 15 mil partidos)', (:filas_esc > 15000)::int, 1);
SELECT pg_temp.esperar('el conjunto oficial se alcanza por el indice de temporada que ya existe', (position('ix_esc_temporada_jornada' in :'plan_o') > 0)::int, 1);
SELECT pg_temp.esperar('...sin recorrer la tabla completa', (position('Seq Scan' in :'plan_o') = 0)::int, 1);
\echo 'Indicadores oficiales de la temporada (DB-22.1) verificados.'
