-- Verifica DB-4.1: índices creados, plan de la consulta de H4 y tiempo.
-- Requiere el seed de DB-3.2 (66 partidos de "Apertura 2026").
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h4-explain.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido;
  END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('indices de DB-4.1 creados', (SELECT count(*) FROM pg_indexes
  WHERE tablename='partido' AND indexname IN ('ix_partido_local_inicio','ix_partido_visitante_inicio','ix_partido_temporada_jornada')), 3);
SELECT pg_temp.esperar('partidos en la tabla', (SELECT count(*) FROM partido), 66);

-- Equipo de prueba: el primer inscrito de Apertura 2026.
SELECT e.id AS equipo FROM equipo e JOIN temporada t ON t.id=e.temporada_id
 WHERE t.nombre='Apertura 2026' ORDER BY e.id LIMIT 1 \gset

SELECT pg_temp.esperar('partidos del equipo (consulta de referencia)', (SELECT count(*) FROM partido
  WHERE (equipo_local_id = :equipo OR equipo_visitante_id = :equipo) AND estado <> 'CANCELADO'), 11);

ANALYZE partido;

\echo
\echo '=== 1) Plan tal como lo elige PostgreSQL (con 66 filas) ==='
\echo 'Con tan pocas filas el optimizador prefiere recorrer la tabla: es esperado y correcto.'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM partido
 WHERE (equipo_local_id = :equipo OR equipo_visitante_id = :equipo)
   AND estado <> 'CANCELADO'
 ORDER BY inicio;

\echo
\echo '=== 2) Los 66 partidos del seed, con solo los indices de DB-4.1 ==='
\echo 'En la tabla real el optimizador puede preferir un indice parcial de exclusion (ex_partido_arbitro),'
\echo 'que tambien cubre estado <> CANCELADO. Para aislar lo que hacen NUESTROS indices se usa una copia'
\echo 'de los 66 partidos que solo los tiene a ellos, y se desactiva el recorrido completo.'
CREATE FUNCTION pg_temp.plan(tabla text, eq int, forzar boolean) RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  IF forzar THEN SET LOCAL enable_seqscan = off; SET LOCAL enable_indexscan = off; END IF;
  FOR linea IN EXECUTE format($q$EXPLAIN (ANALYZE, COSTS OFF)
    SELECT * FROM %I WHERE (equipo_local_id = %s OR equipo_visitante_id = %s)
    AND estado <> 'CANCELADO' ORDER BY inicio$q$, tabla, eq, eq) LOOP
    res := res || linea || E'\n';
  END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;

BEGIN;
CREATE TEMP TABLE partido_seed ON COMMIT DROP AS SELECT * FROM partido;
CREATE INDEX ON partido_seed (equipo_local_id, inicio);
CREATE INDEX ON partido_seed (equipo_visitante_id, inicio);
ANALYZE partido_seed;
SELECT pg_temp.plan('partido_seed', :equipo, true) AS plan2 \gset
COMMIT;
\echo :plan2
SELECT pg_temp.esperar('(66 filas) plan usa BitmapOr', (position('BitmapOr' in :'plan2') > 0)::int, 1);
SELECT pg_temp.esperar('(66 filas) usa los dos indices (local y visitante)', (SELECT count(DISTINCT m[1]) FROM regexp_matches(:'plan2', 'Bitmap Index Scan on (\S+)', 'g') AS m), 2);
SELECT (regexp_match(:'plan2', 'Execution Time: ([0-9.]+) ms'))[1]::numeric AS ms2 \gset
SELECT pg_temp.esperar('(66 filas) ejecucion menor a 50 ms (' || :'ms2' || ' ms)', (:ms2::numeric < 50)::int, 1);

\echo
\echo '=== 3) Copia temporal de 100 000 partidos, SIN tocar el optimizador ==='
\echo 'Muestra que el plan elegido de forma natural cuando la tabla crece usa los indices.'
BEGIN;
CREATE TEMP TABLE partido_grande (LIKE partido INCLUDING DEFAULTS) ON COMMIT DROP;
INSERT INTO partido_grande (temporada_id, jornada_id, equipo_local_id, equipo_visitante_id, cancha_id, arbitro_id, inicio, fin, estado)
SELECT 1, 1, 1 + (g % 400), 1 + ((g + 1 + (g / 400) % 399) % 400), 1,
       (SELECT id FROM usuario LIMIT 1),
       timestamptz '2026-11-07 14:00+00' + (g * interval '1 hour'),
       timestamptz '2026-11-07 15:30+00' + (g * interval '1 hour'),
       'PROGRAMADO'
FROM generate_series(1, 100000) g;
CREATE INDEX ON partido_grande (equipo_local_id, inicio);
CREATE INDEX ON partido_grande (equipo_visitante_id, inicio);
ANALYZE partido_grande;
SELECT pg_temp.plan('partido_grande', 7, false) AS plan3 \gset
COMMIT;
\echo :plan3
SELECT pg_temp.esperar('(100 000 filas) plan usa BitmapOr', (position('BitmapOr' in :'plan3') > 0)::int, 1);
SELECT pg_temp.esperar('(100 000 filas) sin recorrido completo', (position('Seq Scan' in :'plan3') = 0)::int, 1);
SELECT (regexp_match(:'plan3', 'Execution Time: ([0-9.]+) ms'))[1]::numeric AS ms3 \gset
SELECT pg_temp.esperar('(100 000 filas) ejecucion menor a 50 ms (' || :'ms3' || ' ms)', (:ms3::numeric < 50)::int, 1);

\echo
\echo '=== 4) Listado de una jornada (H3) ==='
BEGIN;
SET LOCAL enable_seqscan = off;
SET LOCAL enable_indexscan = off;
EXPLAIN (COSTS OFF)
SELECT * FROM partido WHERE temporada_id = (SELECT id FROM temporada WHERE nombre='Apertura 2026')
   AND jornada_id = (SELECT min(id) FROM jornada);
COMMIT;
\echo 'Indices de DB-4.1 verificados.'
