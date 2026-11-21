-- Verifica el seed de H1 (DB-1.2) ya cargado con `npm run db:seed`.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h1-seed.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido;
  END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('Apertura 2026 Inscritos', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Apertura 2026' AND e.estado='INSCRITO'), 12);
SELECT pg_temp.esperar('Apertura 2026 Pendientes', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Apertura 2026' AND e.estado='PENDIENTE'), 1);
SELECT pg_temp.esperar('Clausura 2027 Inscritos', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Clausura 2027' AND e.estado='INSCRITO'), 10);
SELECT pg_temp.esperar('Clausura 2027 Pendientes', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Clausura 2027' AND e.estado='PENDIENTE'), 3);
SELECT pg_temp.esperar('Clausura 2027 Rechazados', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Clausura 2027' AND e.estado='RECHAZADO'), 1);
SELECT pg_temp.esperar('Clausura 2025 Inscritos', (SELECT count(*) FROM equipo e JOIN temporada t ON t.id=e.temporada_id WHERE t.nombre='Clausura 2025' AND e.estado='INSCRITO'), 4);
SELECT pg_temp.esperar('Arbitros', (SELECT count(*) FROM usuario WHERE rol='ARBITRO'), 4);
SELECT pg_temp.esperar('Organizadores', (SELECT count(*) FROM usuario WHERE rol='ORGANIZADOR'), 1);
SELECT pg_temp.esperar('Cuentas Jugador ligadas a fichas distintas', (SELECT count(DISTINCT usuario_id) FROM jugador WHERE usuario_id IS NOT NULL), 12);
SELECT pg_temp.esperar('Temporadas con actual = TRUE', (SELECT count(*) FROM temporada WHERE actual), 1);
SELECT pg_temp.esperar('Equipo con 7 jugadores (Apertura, Inscrito)', (SELECT count(*) FROM (
  SELECT e.id FROM equipo e JOIN temporada t ON t.id=e.temporada_id JOIN equipo_jugador ej ON ej.equipo_id=e.id
  WHERE t.nombre='Apertura 2026' AND e.estado='INSCRITO' GROUP BY e.id HAVING count(*)=7) x), 1);
SELECT pg_temp.esperar('Equipo con 15 jugadores (Apertura, Inscrito)', (SELECT count(*) FROM (
  SELECT e.id FROM equipo e JOIN temporada t ON t.id=e.temporada_id JOIN equipo_jugador ej ON ej.equipo_id=e.id
  WHERE t.nombre='Apertura 2026' AND e.estado='INSCRITO' GROUP BY e.id HAVING count(*)=15) x), 1);
SELECT pg_temp.esperar('Equipos con mas de 15 jugadores', (SELECT count(*) FROM (
  SELECT equipo_id FROM equipo_jugador GROUP BY equipo_id HAVING count(*)>15) x), 0);
SELECT pg_temp.esperar('Jugador que cumple 16 hoy (hora de El Salvador)', (SELECT count(*) FROM jugador
  WHERE fecha_nacimiento = ((now() AT TIME ZONE 'America/El_Salvador')::date - interval '16 years')::date), 1);
\echo 'Seed de H1 verificado.'
