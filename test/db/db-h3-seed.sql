-- Verifica el seed de DB-3.2 (calendario de prueba de "Apertura 2026").
-- Correr ANTES de DB-1.4 (que cambia estados y marcadores) o ignorar la última comprobación.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h3-seed.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido;
  END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

CREATE TEMP VIEW v AS
  SELECT p.*, j.numero AS jornada, j.estado AS estado_jornada
  FROM partido p JOIN jornada j ON j.id = p.jornada_id
  JOIN temporada t ON t.id = p.temporada_id WHERE t.nombre = 'Apertura 2026';

SELECT pg_temp.esperar('partidos', (SELECT count(*) FROM v), 66);
SELECT pg_temp.esperar('jornadas', (SELECT count(DISTINCT jornada) FROM v), 11);
SELECT pg_temp.esperar('jornadas con exactamente 6 partidos', (SELECT count(*) FROM (SELECT jornada FROM v GROUP BY jornada HAVING count(*)=6) x), 11);
SELECT pg_temp.esperar('jornadas Publicadas (1 a 4)', (SELECT count(*) FROM jornada j JOIN temporada t ON t.id=j.temporada_id WHERE t.nombre='Apertura 2026' AND j.estado='PUBLICADA' AND j.numero<=4), 4);
SELECT pg_temp.esperar('jornadas en Borrador (5 a 11)', (SELECT count(*) FROM jornada j JOIN temporada t ON t.id=j.temporada_id WHERE t.nombre='Apertura 2026' AND j.estado='BORRADOR' AND j.numero>=5), 7);
SELECT pg_temp.esperar('equipos con exactamente 11 partidos', (SELECT count(*) FROM (
  SELECT e FROM (SELECT equipo_local_id AS e FROM v UNION ALL SELECT equipo_visitante_id FROM v) q GROUP BY e HAVING count(*)=11) x), 12);
SELECT pg_temp.esperar('equipos con 1 partido en cada una de las 11 jornadas', (SELECT count(*) FROM (
  SELECT e FROM (SELECT equipo_local_id AS e, jornada FROM v UNION ALL SELECT equipo_visitante_id, jornada FROM v) q
  GROUP BY e HAVING count(DISTINCT jornada)=11 AND count(*)=11) x), 12);
SELECT pg_temp.esperar('pares de equipos distintos (cada par una sola vez)', (SELECT count(DISTINCT (least(equipo_local_id,equipo_visitante_id), greatest(equipo_local_id,equipo_visitante_id))) FROM v), 66);
SELECT pg_temp.esperar('arbitros con 16 o 17 partidos', (SELECT count(*) FROM (SELECT arbitro_id FROM v GROUP BY arbitro_id HAVING count(*) BETWEEN 16 AND 17) x), 4);
SELECT pg_temp.esperar('arbitros con dos partidos a la misma hora', (SELECT count(*) FROM (SELECT arbitro_id, inicio FROM v GROUP BY 1,2 HAVING count(*)>1) x), 0);
SELECT pg_temp.esperar('canchas distintas', (SELECT count(DISTINCT cancha_id) FROM v), 2);
SELECT pg_temp.esperar('jornada 1 es el sabado 2026-11-07 08:00 hora de El Salvador', (SELECT count(*) FROM v WHERE jornada=1 AND (inicio AT TIME ZONE 'America/El_Salvador') = '2026-11-07 08:00'), 2);
SELECT pg_temp.esperar('jornada 11 cae el 2027-01-16', (SELECT count(DISTINCT (inicio AT TIME ZONE 'America/El_Salvador')::date) FROM v WHERE jornada=11 AND (inicio AT TIME ZONE 'America/El_Salvador')::date='2027-01-16'), 1);
SELECT pg_temp.esperar('partidos con duracion distinta de 90 min', (SELECT count(*) FROM v WHERE fin-inicio <> interval '90 minutes'), 0);
SELECT pg_temp.esperar('partidos Programados (antes de DB-1.4)', (SELECT count(*) FROM v WHERE estado='PROGRAMADO'), 66);
\echo 'Seed de calendario verificado.'
