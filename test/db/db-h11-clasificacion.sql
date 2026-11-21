-- Verifica DB-11.1: consulta de clasificacion de jugadores por goles o asistencias (H11), con posiciones densas.
-- No requiere cambios de esquema (usa estadistica_partido, partido, equipo_jugador y jugador). Requiere los seeds de H1 y DB-3.2.
-- No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h11-clasificacion.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- ===== La consulta de H11 (p_temporada y p_metrica son parametros; la metrica NO se interpola en el SQL) =====
-- Lista cerrada: 'goles' o 'asistencias'. Cualquier otro valor devuelve vacio en vez de elegir una columna por error.
CREATE FUNCTION pg_temp.clasificacion(p_temporada int, p_metrica text)
RETURNS TABLE (jugador_id int, nombre text, total int, posicion int) AS $$
  SELECT x.jugador_id, j.nombre_completo::text, x.total, DENSE_RANK() OVER (ORDER BY x.total DESC)::int
  FROM (
    SELECT e.jugador_id,
           SUM(CASE p_metrica WHEN 'goles' THEN e.goles WHEN 'asistencias' THEN e.asistencias END)::int AS total
    FROM estadistica_partido e
    JOIN partido p ON p.id = e.partido_id
    JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
    WHERE p.temporada_id = p_temporada AND p.estado = 'FINALIZADO' AND p_metrica IN ('goles', 'asistencias')
    GROUP BY e.jugador_id
  ) x
  JOIN jugador j ON j.id = x.jugador_id
  ORDER BY x.total DESC, x.jugador_id ASC
$$ LANGUAGE sql STABLE;

BEGIN;
-- Linea base vacia DENTRO de esta transaccion: el seed consolidado (DB-1.4) deja pagos, cuotas, estadisticas y partidos
-- Finalizados que estas pruebas no esperan. Todo se restaura con el ROLLBACK final.
DELETE FROM pago; DELETE FROM cuota; DELETE FROM estadistica_partido; DELETE FROM participacion_partido;
UPDATE partido SET estado='PROGRAMADO', goles_local=0, goles_visitante=0, faltas_local=0, faltas_visitante=0, inicio_real=NULL, fin_real=NULL WHERE estado<>'PROGRAMADO';
DELETE FROM partido WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025'); DELETE FROM jornada WHERE temporada_id=(SELECT id FROM temporada WHERE nombre='Clausura 2025');
SELECT id AS t1 FROM temporada WHERE nombre='Apertura 2026' \gset
SELECT equipo_id AS eq FROM equipo_jugador WHERE temporada_id=:t1 GROUP BY equipo_id HAVING count(*) >= 6 ORDER BY equipo_id LIMIT 1 \gset
SELECT array_agg(jugador_id ORDER BY jugador_id) AS js FROM (SELECT jugador_id FROM equipo_jugador WHERE equipo_id=:eq ORDER BY jugador_id LIMIT 6) x \gset
SELECT (:'js'::int[])[1] AS ja, (:'js'::int[])[2] AS jb, (:'js'::int[])[3] AS jc, (:'js'::int[])[4] AS jd, (:'js'::int[])[5] AS je, (:'js'::int[])[6] AS jf \gset
SELECT array_agg(id ORDER BY inicio) AS ms FROM (SELECT id, inicio FROM partido WHERE temporada_id=:t1 AND (equipo_local_id=:eq OR equipo_visitante_id=:eq) AND estado='PROGRAMADO' ORDER BY inicio LIMIT 3) x \gset
SELECT (:'ms'::int[])[1] AS m1, (:'ms'::int[])[2] AS m2, (:'ms'::int[])[3] AS m3 \gset

SELECT pg_temp.esperar('sin registros oficiales: clasificacion vacia', (SELECT count(*) FROM pg_temp.clasificacion(:t1, 'goles')), 0);

-- m1 y m2 Finalizados (oficiales); m3 queda Programado (no oficial)
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id IN (:m1,:m2);
UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id IN (:m1,:m2);
--                                  goles asist
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias) VALUES
  (:m1,:ja,3,1), (:m2,:ja,2,0),   -- A: 5 goles, 1 asistencia
  (:m1,:jb,3,4),                  -- B: 3 goles, 4 asistencias
  (:m2,:jc,3,1),                  -- C: 3 goles, 1 asistencia
  (:m1,:jd,1,0),                  -- D: 1 gol,  0 asistencias
  (:m1,:je,0,0),                  -- E: registro oficial con total cero (debe aparecer)
  (:m3,:jf,9,9);                  -- F: solo un partido no oficial (no debe aparecer)

-- Otra temporada: A tambien juega alli con 7 goles en un partido Finalizado
SELECT t.id AS t2 FROM temporada t WHERE t.nombre <> 'Apertura 2026' AND (SELECT count(DISTINCT equipo_id) FROM equipo_jugador WHERE temporada_id=t.id) >= 2 ORDER BY t.id LIMIT 1 \gset
SELECT id AS ea FROM equipo WHERE temporada_id=:t2 ORDER BY id LIMIT 1 \gset
SELECT id AS eb FROM equipo WHERE temporada_id=:t2 AND id<>:ea ORDER BY id LIMIT 1 \gset
INSERT INTO jornada(temporada_id,numero,estado) VALUES (:t2,1,'BORRADOR') RETURNING id AS j2 \gset
SELECT cancha_id AS cn, arbitro_id AS ar, (fin-inicio) AS dur FROM partido ORDER BY id LIMIT 1 \gset
INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado)
  VALUES (:t2,:j2,:ea,:eb,:cn,:'ar',timestamptz '2027-03-01 15:00+00',timestamptz '2027-03-01 15:00+00'+:'dur'::interval,'PROGRAMADO') RETURNING id AS pz \gset
INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (:ea,:ja,:t2);
INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias) VALUES (:pz,:ja,7,0);
UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=:pz;
UPDATE partido SET estado='FINALIZADO', fin_real=now() WHERE id=:pz;

-- ---- Goles: totales 5, 3, 3, 1 (y 0) => posiciones 1, 2, 2, 3 (y 4) ----
SELECT pg_temp.esperar('goles: 5 jugadores (F, de partido no oficial, no entra)', (SELECT count(*) FROM pg_temp.clasificacion(:t1, 'goles')), 5);
SELECT pg_temp.esperar('goles: totales en orden 5,3,3,1,0', (SELECT string_agg(total::text, ',' ORDER BY total DESC, jugador_id) = '5,3,3,1,0' FROM pg_temp.clasificacion(:t1, 'goles'))::int, 1);
SELECT pg_temp.esperar('goles: posiciones 1,2,2,3,4 (densas)', (SELECT string_agg(posicion::text, ',') = '1,2,2,3,4' FROM pg_temp.clasificacion(:t1, 'goles'))::int, 1);
SELECT pg_temp.esperar('goles: el empate se ordena por jugador_id (B antes que C)', (SELECT string_agg(jugador_id::text, ',') = (:'ja' || ',' || :'jb' || ',' || :'jc' || ',' || :'jd' || ',' || :'je') FROM pg_temp.clasificacion(:t1, 'goles'))::int, 1);
SELECT pg_temp.esperar('goles: los empatados comparten posicion', (SELECT count(DISTINCT posicion) FROM pg_temp.clasificacion(:t1, 'goles') WHERE total = 3), 1);
SELECT pg_temp.esperar('goles: el de total cero aparece (tiene un registro oficial)', (SELECT total FROM pg_temp.clasificacion(:t1, 'goles') WHERE jugador_id = :je), 0);
SELECT pg_temp.esperar('goles: no entran los 7 de otra temporada (A sigue en 5)', (SELECT total FROM pg_temp.clasificacion(:t1, 'goles') WHERE jugador_id = :ja), 5);
SELECT pg_temp.esperar('goles: no entra el jugador con solo partidos no oficiales', (SELECT count(*) FROM pg_temp.clasificacion(:t1, 'goles') WHERE jugador_id = :jf), 0);
SELECT pg_temp.esperar('goles: sin filas duplicadas (un jugador, una fila)', (SELECT count(*) - count(DISTINCT jugador_id) FROM pg_temp.clasificacion(:t1, 'goles')), 0);

-- ---- Asistencias: totales 4, 1, 1, 0, 0 => posiciones 1, 2, 2, 3, 3 ----
SELECT pg_temp.esperar('asistencias: totales 4,1,1,0,0', (SELECT string_agg(total::text, ',' ORDER BY total DESC, jugador_id) = '4,1,1,0,0' FROM pg_temp.clasificacion(:t1, 'asistencias'))::int, 1);
SELECT pg_temp.esperar('asistencias: posiciones 1,2,2,3,3', (SELECT string_agg(posicion::text, ',') = '1,2,2,3,3' FROM pg_temp.clasificacion(:t1, 'asistencias'))::int, 1);
SELECT pg_temp.esperar('asistencias: el primero es B', (SELECT jugador_id FROM pg_temp.clasificacion(:t1, 'asistencias') LIMIT 1), :jb);

-- ---- Otra temporada: aislada ----
SELECT pg_temp.esperar('otra temporada: solo A con 7 goles, posicion 1', (SELECT count(*) FROM pg_temp.clasificacion(:t2, 'goles') WHERE jugador_id = :ja AND total = 7 AND posicion = 1), 1);
SELECT pg_temp.esperar('otra temporada: no arrastra a los demas', (SELECT count(*) FROM pg_temp.clasificacion(:t2, 'goles')), 1);

-- ---- Metrica fuera de la lista cerrada ----
SELECT pg_temp.esperar('metrica invalida: vacio', (SELECT count(*) FROM pg_temp.clasificacion(:t1, 'tarjetas')), 0);
SELECT pg_temp.esperar('metrica con intento de inyeccion: vacio (se trata como dato, no como SQL)', (SELECT count(*) FROM pg_temp.clasificacion(:t1, 'goles; DROP TABLE jugador')), 0);
SELECT pg_temp.esperar('metrica NULL: vacio', (SELECT count(*) FROM pg_temp.clasificacion(:t1, NULL)), 0);
SELECT pg_temp.esperar('temporada inexistente: vacio', (SELECT count(*) FROM pg_temp.clasificacion(0, 'goles')), 0);

-- ---- Una correccion autorizada se refleja al volver a ejecutar ----
UPDATE estadistica_partido SET goles = 0 WHERE partido_id = :m1 AND jugador_id = :ja;   -- A baja de 5 a 2
SELECT pg_temp.esperar('tras corregir: posiciones nuevas 1,1,2,3,4 (B y C empatan arriba)', (SELECT string_agg(posicion::text, ',') = '1,1,2,3,4' FROM pg_temp.clasificacion(:t1, 'goles'))::int, 1);
SELECT pg_temp.esperar('tras corregir: A queda con 2', (SELECT total FROM pg_temp.clasificacion(:t1, 'goles') WHERE jugador_id = :ja), 2);
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK no queda nada de la prueba', (SELECT count(*) FROM estadistica_partido WHERE goles >= 3), 0);
\echo 'Clasificacion de jugadores (DB-11.1) verificada.'
