-- Verifica DB-10.1: consultas de estadisticas oficiales por jugador y temporada (H10) e indice ix_estadistica_jugador.
-- Requiere el seed de DB-3.2 (66 partidos) y H1. No deja datos: todo corre en transacciones que se revierten.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h10-consultas.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('indice ix_estadistica_jugador (jugador_id)', (SELECT count(*) FROM pg_indexes
  WHERE tablename='estadistica_partido' AND indexname='ix_estadistica_jugador' AND indexdef LIKE '%(jugador_id)'), 1);

-- ===== Las dos consultas de H10 (p_jugador, p_temporada son parametros) =====
-- Acumulados: una sola fila; sin registros devuelve ceros (COALESCE).
CREATE FUNCTION pg_temp.acumulados(p_jugador int, p_temporada int) RETURNS TABLE (goles int, asistencias int, tarjetas int) AS $$
  SELECT COALESCE(SUM(e.goles), 0)::int, COALESCE(SUM(e.asistencias), 0)::int, COALESCE(SUM(e.tarjetas), 0)::int
  FROM estadistica_partido e
  JOIN partido p ON p.id = e.partido_id
  JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
  WHERE e.jugador_id = p_jugador AND p.temporada_id = p_temporada AND p.estado = 'FINALIZADO'
$$ LANGUAGE sql STABLE;
-- Detalle: un renglon por partido Finalizado, el mas reciente primero; rival = el otro equipo del partido.
CREATE FUNCTION pg_temp.detalle(p_jugador int, p_temporada int) RETURNS TABLE (partido_id int, fecha timestamptz, rival_id int, rival text, goles int, asistencias int, tarjetas int) AS $$
  SELECT p.id, p.inicio, rival.id, rival.nombre::text, e.goles, e.asistencias, e.tarjetas
  FROM estadistica_partido e
  JOIN partido p ON p.id = e.partido_id
  JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
  JOIN equipo rival ON rival.id = CASE WHEN ej.equipo_id = p.equipo_local_id THEN p.equipo_visitante_id ELSE p.equipo_local_id END
  WHERE e.jugador_id = p_jugador AND p.temporada_id = p_temporada AND p.estado = 'FINALIZADO'
  ORDER BY p.inicio DESC, p.id DESC
$$ LANGUAGE sql STABLE;

BEGIN;
-- Linea base vacia DENTRO de esta transaccion: el seed consolidado (DB-1.4) deja pagos, cuotas, estadisticas y partidos
-- Finalizados que estas pruebas no esperan. Todo se restaura con el ROLLBACK final.
DELETE FROM pago; DELETE FROM cuota; DELETE FROM estadistica_partido; DELETE FROM participacion_partido;
UPDATE partido SET estado='PROGRAMADO', goles_local=0, goles_visitante=0, faltas_local=0, faltas_visitante=0, inicio_real=NULL, fin_real=NULL WHERE estado<>'PROGRAMADO';
DELETE FROM partido WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025'); DELETE FROM jornada WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025');
SELECT id AS t1 FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT ej.jugador_id AS j, ej.equipo_id AS eq FROM equipo_jugador ej WHERE ej.temporada_id=:t1 ORDER BY ej.equipo_id, ej.jugador_id LIMIT 1 \gset
SELECT ej.jugador_id AS k FROM equipo_jugador ej WHERE ej.temporada_id=:t1 AND ej.equipo_id=:eq AND ej.jugador_id<>:j ORDER BY ej.jugador_id LIMIT 1 \gset
SELECT array_agg(id ORDER BY inicio) AS ms FROM (SELECT id, inicio FROM partido WHERE temporada_id=:t1 AND (equipo_local_id=:eq OR equipo_visitante_id=:eq) AND estado='PROGRAMADO' ORDER BY inicio LIMIT 5) x \gset
SELECT (:'ms'::int[])[1] AS m1, (:'ms'::int[])[2] AS m2, (:'ms'::int[])[3] AS m3, (:'ms'::int[])[4] AS m4, (:'ms'::int[])[5] AS m5 \gset

-- Sin registros: acumulados en cero y detalle vacio
SELECT pg_temp.esperar('sin registros: una fila de acumulados', (SELECT count(*) FROM pg_temp.acumulados(:j, :t1)), 1);
SELECT pg_temp.esperar('sin registros: goles + asistencias + tarjetas = 0', (SELECT goles + asistencias + tarjetas FROM pg_temp.acumulados(:j, :t1)), 0);
SELECT pg_temp.esperar('sin registros: detalle vacio', (SELECT count(*) FROM pg_temp.detalle(:j, :t1)), 0);
SELECT pg_temp.esperar('jugador inexistente: ceros y detalle vacio', (SELECT goles + asistencias + tarjetas FROM pg_temp.acumulados(0, :t1)) + (SELECT count(*) FROM pg_temp.detalle(0, :t1)), 0);

-- m1, m2, m3: Finalizados (oficiales). m4: Programado y m5: En curso (no oficiales).
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id IN (:m1,:m2,:m3,:m5);
UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id IN (:m1,:m2,:m3);
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES
  (:m1,:j,2,1,0), (:m2,:j,1,0,1), (:m3,:j,0,2,0),   -- oficiales: 3 goles, 3 asistencias, 1 tarjeta
  (:m4,:j,5,5,5), (:m5,:j,5,5,5),                    -- no oficiales: no deben contar
  (:m1,:k,9,9,9);                                    -- otro jugador: no debe contar

-- Temporada ajena: j tambien juega en otra temporada con 7 goles en un partido Finalizado
SELECT t.id AS t2 FROM temporada t WHERE t.nombre <> 'Apertura 2026' AND (SELECT count(DISTINCT equipo_id) FROM equipo_jugador WHERE temporada_id=t.id) >= 2 ORDER BY t.id LIMIT 1 \gset
SELECT id AS ea FROM equipo WHERE temporada_id=:t2 ORDER BY id LIMIT 1 \gset
SELECT id AS eb FROM equipo WHERE temporada_id=:t2 AND id<>:ea ORDER BY id LIMIT 1 \gset
INSERT INTO jornada(temporada_id,numero,estado) VALUES (:t2,1,'BORRADOR') RETURNING id AS j2 \gset
SELECT cancha_id AS cn, arbitro_id AS ar, (fin-inicio) AS dur FROM partido ORDER BY id LIMIT 1 \gset
INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado)
  VALUES (:t2,:j2,:ea,:eb,:cn,:'ar',timestamptz '2027-03-01 15:00+00',timestamptz '2027-03-01 15:00+00'+:'dur'::interval,'PROGRAMADO') RETURNING id AS pz \gset
INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (:ea,:j,:t2);
INSERT INTO estadistica_partido(partido_id,jugador_id,goles) VALUES (:pz,:j,7);
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:pz;
UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id=:pz;

SELECT count(*) AS filas_antes FROM estadistica_partido \gset

-- Acumulados: solo oficiales, de ese jugador y esa temporada
SELECT pg_temp.esperar('acumulados: goles (2+1+0; sin los 5 ni 5 de no oficiales, ni los 7 de otra temporada, ni los 9 de otro jugador)', (SELECT goles FROM pg_temp.acumulados(:j, :t1)), 3);
SELECT pg_temp.esperar('acumulados: asistencias (1+0+2)', (SELECT asistencias FROM pg_temp.acumulados(:j, :t1)), 3);
SELECT pg_temp.esperar('acumulados: tarjetas (0+1+0)', (SELECT tarjetas FROM pg_temp.acumulados(:j, :t1)), 1);
SELECT pg_temp.esperar('otra temporada: solo cuenta la suya (7 goles)', (SELECT goles FROM pg_temp.acumulados(:j, :t2)), 7);
SELECT pg_temp.esperar('otro jugador: sus 9 goles, no los de j', (SELECT goles FROM pg_temp.acumulados(:k, :t1)), 9);

-- Detalle
SELECT pg_temp.esperar('detalle: 3 partidos oficiales', (SELECT count(*) FROM pg_temp.detalle(:j, :t1)), 3);
SELECT pg_temp.esperar('detalle: excluye el Programado y el En curso', (SELECT count(*) FROM pg_temp.detalle(:j, :t1) WHERE partido_id IN (:m4, :m5)), 0);
SELECT pg_temp.esperar('detalle: excluye la temporada ajena', (SELECT count(*) FROM pg_temp.detalle(:j, :t1) WHERE partido_id = :pz), 0);
SELECT pg_temp.esperar('detalle: orden por inicio DESC (m3, m2, m1)', (SELECT array_to_string(array_agg(partido_id), ',') = :'m3' || ',' || :'m2' || ',' || :'m1' FROM pg_temp.detalle(:j, :t1))::int, 1);
SELECT pg_temp.esperar('detalle: el rival es el otro equipo del partido', (SELECT count(*) FROM pg_temp.detalle(:j, :t1) d JOIN partido p ON p.id = d.partido_id
  WHERE d.rival_id <> :eq AND d.rival_id IN (p.equipo_local_id, p.equipo_visitante_id)), 3);
SELECT pg_temp.esperar('detalle: los acumulados son la suma del detalle (goles)', (SELECT sum(goles) FROM pg_temp.detalle(:j, :t1)) - (SELECT goles FROM pg_temp.acumulados(:j, :t1)), 0);
SELECT pg_temp.esperar('detalle: los acumulados son la suma del detalle (asistencias)', (SELECT sum(asistencias) FROM pg_temp.detalle(:j, :t1)) - (SELECT asistencias FROM pg_temp.acumulados(:j, :t1)), 0);
SELECT pg_temp.esperar('detalle: no duplica partidos', (SELECT count(*) - count(DISTINCT partido_id) FROM pg_temp.detalle(:j, :t1)), 0);

-- Una correccion oficial se refleja al volver a consultar
UPDATE estadistica_partido SET goles = 4 WHERE partido_id = :m1 AND jugador_id = :j;
SELECT pg_temp.esperar('tras corregir un registro, acumulados usa el dato vigente (4+1+0)', (SELECT goles FROM pg_temp.acumulados(:j, :t1)), 5);
-- Cuando un partido deja de ser oficial (hipotetico), sale de la suma
UPDATE partido SET estado='CANCELADO', fin_real=NULL, inicio_real=NULL WHERE id = :m3;
SELECT pg_temp.esperar('un partido que deja de estar Finalizado sale del detalle', (SELECT count(*) FROM pg_temp.detalle(:j, :t1)), 2);

-- Las consultas no escriben ni duplican
SELECT pg_temp.esperar('las consultas no cambiaron la cantidad de registros', (SELECT count(*) FROM estadistica_partido) - :filas_antes, 0);
ROLLBACK;

-- ===== EXPLAIN: el indice por jugador =====
\echo
\echo '=== EXPLAIN: estadisticas de un jugador (copia escalada de ~20 mil registros) ==='
\echo 'La tabla real tiene pocas filas; con ellas PostgreSQL lee todo. En una copia temporal con el volumen de una liga'
\echo 'grande (todos los jugadores x todos los partidos) se ve el indice nuevo en uso.'
CREATE FUNCTION pg_temp.plan_jugador(p_jugador int) RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  FOR linea IN EXECUTE format($q$EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
    SELECT sum(goles) FROM est_escala WHERE jugador_id = %s$q$, p_jugador) LOOP
    res := res || linea || E'\n';
  END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;
BEGIN;
CREATE TEMP TABLE est_escala ON COMMIT DROP AS
  SELECT p.id AS partido_id, j.id AS jugador_id, (p.id % 3) AS goles, 0 AS asistencias, 0 AS tarjetas
  FROM partido p CROSS JOIN jugador j;
CREATE UNIQUE INDEX ON est_escala (partido_id, jugador_id);
CREATE INDEX ix_escala_jugador ON est_escala (jugador_id);
ANALYZE est_escala;
SELECT id AS jprueba FROM jugador ORDER BY id LIMIT 1 \gset
SELECT pg_temp.plan_jugador(:jprueba) AS plan_j \gset
SELECT count(*) AS filas_escala FROM est_escala \gset
COMMIT;
\echo :plan_j
SELECT pg_temp.esperar('la copia escalada tiene volumen (> 10 mil filas)', (:filas_escala > 10000)::int, 1);
SELECT pg_temp.esperar('buscar por jugador usa el indice por jugador_id', (position('ix_escala_jugador' in :'plan_j') > 0)::int, 1);
SELECT pg_temp.esperar('...sin recorrer la tabla completa', (position('Seq Scan' in :'plan_j') = 0)::int, 1);
\echo 'Consultas de estadisticas personales (DB-10.1) verificadas.'
