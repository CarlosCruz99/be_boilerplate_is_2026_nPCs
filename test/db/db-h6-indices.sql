-- Verifica DB-6.1: indice de la lista de partidos (H6), plan EXPLAIN y consultas de lista y detalle.
-- Requiere el seed de DB-3.2 (66 partidos) y H1. No deja datos: las pruebas corren en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h6-indices.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- ============ 1) Indices ============
SELECT pg_temp.esperar('indice ix_partido_estado_inicio (estado, inicio DESC)', (SELECT count(*) FROM pg_indexes
  WHERE tablename='partido' AND indexname='ix_partido_estado_inicio' AND indexdef LIKE '%(estado, inicio DESC)'), 1);
SELECT pg_temp.esperar('NO existe ix_participacion_partido (la llave primaria ya empieza por partido_id)', (SELECT count(*) FROM pg_indexes WHERE indexname='ix_participacion_partido'), 0);
SELECT pg_temp.esperar('la llave primaria de participacion_partido es (partido_id, jugador_id)', (SELECT count(*) FROM pg_indexes
  WHERE tablename='participacion_partido' AND indexname='participacion_partido_pkey' AND indexdef LIKE '%(partido_id, jugador_id)'), 1);

-- ============ 2) EXPLAIN de la lista ============
\echo
\echo '=== EXPLAIN de la lista (filtro por estado, orden por inicio DESC, pagina de 20) ==='
\echo 'La tabla real solo tiene 66 filas y PostgreSQL prefiere leerla completa: es correcto. Para ver el indice con'
\echo 'volumen realista se usa una copia temporal escalada (~20 mil partidos: 8% EN_CURSO, 8% FINALIZADO) con el mismo indice.'
CREATE FUNCTION pg_temp.plan(estado text) RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  FOR linea IN EXECUTE format($q$EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
    SELECT * FROM partido_escala WHERE estado = %L AND estado <> 'CANCELADO'
    ORDER BY inicio DESC, id DESC LIMIT 20$q$, estado) LOOP
    res := res || linea || E'\n';
  END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;

BEGIN;
CREATE TEMP TABLE partido_escala ON COMMIT DROP AS SELECT * FROM partido;
INSERT INTO partido_escala SELECT p.* FROM partido p, generate_series(1, 300) g;
SELECT setseed(0.42);
UPDATE partido_escala SET
  estado = (CASE WHEN r < 0.08 THEN 'EN_CURSO' WHEN r < 0.16 THEN 'FINALIZADO' WHEN r < 0.20 THEN 'CANCELADO' ELSE 'PROGRAMADO' END)::estado_partido,
  inicio = timestamptz '2026-08-01' + random() * interval '180 days',
  inicio_real = NULL, fin_real = NULL
  FROM (SELECT ctid AS c, random() AS r FROM partido_escala) x WHERE partido_escala.ctid = x.c;
CREATE INDEX ix_escala_estado_inicio ON partido_escala (estado, inicio DESC);
ANALYZE partido_escala;
SELECT pg_temp.plan('EN_CURSO')    AS plan_en_curso \gset
SELECT pg_temp.plan('FINALIZADO')  AS plan_final \gset
SELECT pg_temp.plan('PROGRAMADO')  AS plan_prog \gset
COMMIT;
\echo '--- estado = EN_CURSO ---'
\echo :plan_en_curso
\echo '--- estado = PROGRAMADO (el estado mas comun) ---'
\echo :plan_prog
SELECT pg_temp.esperar('EN_CURSO usa el indice por estado', (position('Index Scan using ix_escala_estado_inicio' in :'plan_en_curso') > 0)::int, 1);
SELECT pg_temp.esperar('FINALIZADO usa el indice por estado', (position('Index Scan using ix_escala_estado_inicio' in :'plan_final') > 0)::int, 1);
SELECT pg_temp.esperar('PROGRAMADO usa el indice por estado', (position('Index Scan using ix_escala_estado_inicio' in :'plan_prog') > 0)::int, 1);
-- El indice entrega los 20 mas recientes de ese estado sin recorrer la tabla: lee ~21 filas (una pagina mas la que cierra
-- el empate). El Incremental Sort que se ve es solo el desempate id DESC (paginacion estable) sobre esas pocas filas.
SELECT pg_temp.esperar('EN_CURSO lee solo ~una pagina (<= 25 filas, no las ~1600 del estado)',
  (SELECT (regexp_match(:'plan_en_curso', 'Index Scan using ix_escala_estado_inicio on partido_escala \(actual rows=(\d+)'))[1]::int <= 25)::int, 1);
SELECT pg_temp.esperar('PROGRAMADO lee solo ~una pagina (<= 25 filas, no las ~16000 del estado)',
  (SELECT (regexp_match(:'plan_prog', 'Index Scan using ix_escala_estado_inicio on partido_escala \(actual rows=(\d+)'))[1]::int <= 25)::int, 1);
SELECT pg_temp.esperar('ningun plan recorre la tabla completa (sin Seq Scan)', (position('Seq Scan' in :'plan_en_curso' || :'plan_final' || :'plan_prog') = 0)::int, 1);

-- ============ 3) Consultas de la lista y del detalle ============
BEGIN;
SELECT id AS p, temporada_id AS t, equipo_local_id AS loc, equipo_visitante_id AS vis, jornada_id AS jp FROM partido WHERE estado='PROGRAMADO' ORDER BY id LIMIT 1 \gset
SELECT id AS p2, jornada_id AS j2 FROM partido WHERE estado='PROGRAMADO' AND jornada_id <> :jp ORDER BY id LIMIT 1 \gset
SELECT id AS p3 FROM partido WHERE estado='PROGRAMADO' AND id NOT IN (:p, :p2) ORDER BY id LIMIT 1 \gset
SELECT jugador_id AS jl1 FROM equipo_jugador WHERE equipo_id=:loc ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jl2 FROM equipo_jugador WHERE equipo_id=:loc ORDER BY jugador_id OFFSET 1 LIMIT 1 \gset
SELECT jugador_id AS jv1 FROM equipo_jugador WHERE equipo_id=:vis ORDER BY jugador_id LIMIT 1 \gset
SELECT jugador_id AS jv2 FROM equipo_jugador WHERE equipo_id=:vis ORDER BY jugador_id OFFSET 1 LIMIT 1 \gset

-- p: Finalizado 2-1 con faltas 5/3; p2: su jornada pasa a Borrador; p3: Cancelado
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:p;
UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=2, goles_visitante=1, faltas_local=5, faltas_visitante=3 WHERE id=:p;
UPDATE partido SET estado='CANCELADO' WHERE id=:p3;
UPDATE jornada SET estado='BORRADOR', publicada_en=NULL, publicada_por=NULL WHERE id=:j2;
INSERT INTO participacion_partido(partido_id, jugador_id, equipo_id) VALUES (:p,:jl1,:loc),(:p,:jl2,:loc),(:p,:jv1,:vis),(:p,:jv2,:vis);
INSERT INTO estadistica_partido(partido_id, jugador_id, goles, asistencias, tarjetas) VALUES (:p,:jl1,2,0,0),(:p,:jl2,0,1,0),(:p,:jv1,1,0,1);

-- ---- Detalle: marcador y faltas ----
SELECT pg_temp.esperar('detalle: marcador 2-1', (SELECT goles_local*10 + goles_visitante FROM partido WHERE id=:p), 21);
SELECT pg_temp.esperar('detalle: faltas 5 y 3', (SELECT faltas_local*10 + faltas_visitante FROM partido WHERE id=:p), 53);

-- ---- Detalle: participantes (consulta usada por BE-6.2) ----
SELECT pg_temp.esperar('participantes: 4 jugadores',
  (SELECT count(*) FROM (SELECT pp.equipo_id, j.id, j.nombre_completo FROM participacion_partido pp JOIN jugador j ON j.id = pp.jugador_id
    WHERE pp.partido_id = :p ORDER BY pp.equipo_id, j.nombre_completo, j.id) x), 4);

-- ---- Detalle: goleadores (goles > 0), sin duplicar filas ----
CREATE TEMP TABLE goleadores AS
  SELECT ej.equipo_id, j.id AS jugador_id, j.nombre_completo, e.goles
  FROM estadistica_partido e
  JOIN jugador j ON j.id = e.jugador_id
  JOIN partido pt ON pt.id = e.partido_id
  JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = pt.temporada_id
  WHERE e.partido_id = :p AND e.goles > 0
  ORDER BY e.goles DESC, j.nombre_completo, j.id;
SELECT pg_temp.esperar('goleadores: 2 (el de 0 goles no aparece)', (SELECT count(*) FROM goleadores), 2);
SELECT pg_temp.esperar('goleadores: no duplica filas (un jugador, una fila)', (SELECT count(*) - count(DISTINCT jugador_id) FROM goleadores), 0);
SELECT pg_temp.esperar('goleadores: suman el marcador del partido (3)', (SELECT sum(goles) FROM goleadores), 3);
SELECT pg_temp.esperar('goleadores: cada uno con el equipo correcto', (SELECT count(*) FROM goleadores g WHERE (g.jugador_id=:jl1 AND g.equipo_id=:loc) OR (g.jugador_id=:jv1 AND g.equipo_id=:vis)), 2);
SELECT pg_temp.esperar('goleadores: el de 2 goles va primero', (SELECT jugador_id FROM goleadores LIMIT 1), :jl1);
INSERT INTO estadistica_partido(partido_id,jugador_id,goles) VALUES (:p,:jl1,2)
  ON CONFLICT (partido_id,jugador_id) DO UPDATE SET goles=EXCLUDED.goles;
SELECT pg_temp.esperar('registrar el mismo gol otra vez (upsert) no duplica al goleador',
  (SELECT count(*) FROM estadistica_partido e JOIN jugador j ON j.id = e.jugador_id WHERE e.partido_id = :p AND e.goles > 0), 2);

-- ---- Lista: filtro por estado, equipo, cancelados y jornadas en borrador ----
CREATE FUNCTION pg_temp.lista(p_estado text, p_equipo int, p_organizador boolean, p_limite int DEFAULT 1000) RETURNS TABLE (id int, estado text, goles_local int, goles_visitante int) AS $$
  SELECT p.id, p.estado::text,
         CASE WHEN p.estado = 'PROGRAMADO' THEN NULL ELSE p.goles_local END,
         CASE WHEN p.estado = 'PROGRAMADO' THEN NULL ELSE p.goles_visitante END
  FROM partido p
  JOIN jornada j ON j.id = p.jornada_id
  WHERE p.estado <> 'CANCELADO'
    AND (p_estado IS NULL OR p.estado = p_estado::estado_partido)
    AND (p_equipo IS NULL OR p.equipo_local_id = p_equipo OR p.equipo_visitante_id = p_equipo)
    AND (p_organizador OR j.estado = 'PUBLICADA')
  ORDER BY p.inicio DESC, p.id DESC
  LIMIT p_limite
$$ LANGUAGE sql STABLE;

SELECT pg_temp.esperar('lista FINALIZADO: solo el partido finalizado', (SELECT count(*) FROM pg_temp.lista('FINALIZADO', NULL, false) WHERE id = :p), 1);
SELECT pg_temp.esperar('lista FINALIZADO: trae el marcador 2-1', (SELECT goles_local*10 + goles_visitante FROM pg_temp.lista('FINALIZADO', NULL, false) WHERE id = :p), 21);
SELECT pg_temp.esperar('lista PROGRAMADO: no incluye al finalizado', (SELECT count(*) FROM pg_temp.lista('PROGRAMADO', NULL, false) WHERE id = :p), 0);
SELECT pg_temp.esperar('lista PROGRAMADO: goles es NULL', (SELECT count(*) FROM pg_temp.lista('PROGRAMADO', NULL, true) WHERE goles_local IS NOT NULL OR goles_visitante IS NOT NULL), 0);
SELECT pg_temp.esperar('lista sin estado: nunca trae cancelados', (SELECT count(*) FROM pg_temp.lista(NULL, NULL, true) WHERE id = :p3), 0);
SELECT pg_temp.esperar('lista publica: no trae partidos de jornadas en Borrador', (SELECT count(*) FROM pg_temp.lista(NULL, NULL, false) WHERE id = :p2), 0);
SELECT pg_temp.esperar('lista del organizador: si trae la jornada en Borrador', (SELECT count(*) FROM pg_temp.lista(NULL, NULL, true) WHERE id = :p2), 1);
SELECT pg_temp.esperar('filtro por equipo local', (SELECT count(*) FROM pg_temp.lista(NULL, :loc, false) WHERE id = :p), 1);
SELECT pg_temp.esperar('filtro por equipo visitante', (SELECT count(*) FROM pg_temp.lista(NULL, :vis, false) WHERE id = :p), 1);
SELECT pg_temp.esperar('filtro por equipo: solo partidos de ese equipo', (SELECT count(*) FROM pg_temp.lista(NULL, :loc, true) l JOIN partido x ON x.id = l.id WHERE x.equipo_local_id <> :loc AND x.equipo_visitante_id <> :loc), 0);
SELECT pg_temp.esperar('orden: inicio descendente', (SELECT count(*) FROM (SELECT p.inicio, lag(p.inicio) OVER (ORDER BY o) AS ant FROM
  (SELECT l.id, row_number() OVER () AS o FROM pg_temp.lista(NULL, NULL, true) l) x JOIN partido p ON p.id = x.id) y WHERE ant < inicio), 0);
SELECT pg_temp.esperar('paginacion: LIMIT 20', (SELECT count(*) FROM pg_temp.lista(NULL, NULL, true, 20)), 20);
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no quedan partidos finalizados', (SELECT count(*) FROM partido WHERE estado <> 'PROGRAMADO'), 0);
\echo 'Indices y consultas de H6 (DB-6.1) verificados.'
