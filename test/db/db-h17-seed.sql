-- Verifica los datos de prueba de DB-17.1 (npm run db:seed): partidos con 30, 1 y 0 elementos.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h17-seed.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- La sentencia DEBE fallar con el SQLSTATE indicado: 23514 check, 23503 FK, 23505 unico.
-- 23503 tambien acepta 23001 (restrict_violation): Postgres reciente lo usa para ON DELETE RESTRICT.
CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo OR (codigo = '23503' AND SQLSTATE = '23001') THEN RAISE NOTICE 'OK    % (rechazado: %)', caso, SQLSTATE; RETURN; END IF;
    RAISE EXCEPTION 'FALLO %: fallo por otro motivo (%): %', caso, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO %: la sentencia NO fue rechazada', caso;
END $$ LANGUAGE plpgsql;

-- Ejecuta una sentencia que SI debe funcionar y devuelve las filas afectadas.
CREATE FUNCTION pg_temp.filas(sentencia text) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN EXECUTE sentencia; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$ LANGUAGE plpgsql;

CREATE TEMP VIEW p3 AS
  SELECT p.id, row_number() OVER (ORDER BY p.id) AS n FROM partido p JOIN temporada t ON t.id=p.temporada_id WHERE t.nombre='Apertura 2026';
SELECT pg_temp.esperar('contenidos del seed', (SELECT count(*) FROM contenido_galeria WHERE storage_key LIKE 'seed/galeria/%'), 31);
SELECT pg_temp.esperar('partido 1: 30 elementos activos', (SELECT count(*) FROM contenido_galeria g JOIN p3 ON p3.id=g.partido_id AND p3.n=1 WHERE g.estado='ACTIVO'), 30);
SELECT pg_temp.esperar('partido 1: 25 fotos', (SELECT count(*) FROM contenido_galeria g JOIN p3 ON p3.id=g.partido_id AND p3.n=1 WHERE g.tipo='FOTO'), 25);
SELECT pg_temp.esperar('partido 1: 5 videos', (SELECT count(*) FROM contenido_galeria g JOIN p3 ON p3.id=g.partido_id AND p3.n=1 WHERE g.tipo='VIDEO'), 5);
SELECT pg_temp.esperar('partido 2: 1 elemento', (SELECT count(*) FROM contenido_galeria g JOIN p3 ON p3.id=g.partido_id AND p3.n=2), 1);
SELECT pg_temp.esperar('partido 3: ninguno', (SELECT count(*) FROM contenido_galeria g JOIN p3 ON p3.id=g.partido_id AND p3.n=3), 0);
SELECT pg_temp.esperar('todos publicados por el organizador', (SELECT count(*) FROM contenido_galeria g JOIN usuario u ON u.id=g.subido_por WHERE g.storage_key LIKE 'seed/galeria/%' AND u.rol='ORGANIZADOR'), 31);
SELECT pg_temp.esperar('hay una descripcion de exactamente 200 caracteres', (SELECT count(*) FROM contenido_galeria WHERE storage_key LIKE 'seed/galeria/%' AND char_length(descripcion)=200), 1);
\echo 'Seed de galeria verificado.'
