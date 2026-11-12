-- Verifica DB-7.1: vista v_tabla_posiciones. Requiere el seed de H1. No deja datos (transaccion que se revierte).
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h7-vista.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- La sentencia DEBE fallar con el SQLSTATE indicado (55000: la vista no admite esa operacion).
CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo THEN RAISE NOTICE 'OK    % (rechazado: %)', caso, SQLSTATE; RETURN; END IF;
    RAISE EXCEPTION 'FALLO %: fallo por otro motivo (%): %', caso, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO %: la sentencia NO fue rechazada', caso;
END $$ LANGUAGE plpgsql;

-- Lugar de un equipo en la vista (0 si no aparece).
CREATE FUNCTION pg_temp.lugar(p_equipo int) RETURNS bigint AS $$
  SELECT coalesce((SELECT lugar FROM v_tabla_posiciones WHERE equipo_id = p_equipo), 0)::bigint
$$ LANGUAGE sql;

SELECT pg_temp.esperar('vista v_tabla_posiciones creada', (SELECT count(*) FROM information_schema.views WHERE table_name='v_tabla_posiciones'), 1);
BEGIN;
DELETE FROM posicion;  -- dentro de la transaccion: parte de cero aunque BE-8.1 ya haya cargado filas
SELECT id AS tact FROM temporada WHERE actual \gset
SELECT id AS totra FROM temporada WHERE NOT actual ORDER BY id LIMIT 1 \gset
SELECT array_agg(id ORDER BY id) AS eq FROM (SELECT id FROM equipo WHERE temporada_id = :tact ORDER BY id LIMIT 6) x \gset
SELECT (:'eq'::int[])[1] AS ea, (:'eq'::int[])[2] AS eb, (:'eq'::int[])[3] AS ec, (:'eq'::int[])[4] AS ed, (:'eq'::int[])[5] AS ee, (:'eq'::int[])[6] AS ef \gset
SELECT id AS eotra FROM equipo WHERE temporada_id = :totra ORDER BY id LIMIT 1 \gset

SELECT pg_temp.esperar('sin filas en posicion la vista esta vacia', (SELECT count(*) FROM v_tabla_posiciones), 0);

-- a: 9 pts | b y c: 7 pts y dg 4, desempata gf (6 > 5) | d y e: identicos, desempata el nombre | f: sin partidos
INSERT INTO posicion(temporada_id,equipo_id,pj,pg,pe,pp,gf,gc,dg,puntos) VALUES
  (:tact,:ea,3,3,0,0,9,0,9,9),
  (:tact,:eb,3,2,1,0,6,2,4,7),
  (:tact,:ec,3,2,1,0,5,1,4,7),
  (:tact,:ed,3,1,0,2,2,4,-2,3),
  (:tact,:ee,3,1,0,2,2,4,-2,3),
  (:tact,:ef,0,0,0,0,0,0,0,0),
  (:totra,:eotra,1,1,0,0,30,0,30,3);   -- otra temporada: no debe aparecer

SELECT pg_temp.esperar('la vista solo devuelve la temporada actual (6 equipos)', (SELECT count(*) FROM v_tabla_posiciones), 6);
SELECT pg_temp.esperar('el equipo de otra temporada no aparece', pg_temp.lugar(:eotra), 0);
SELECT pg_temp.esperar('todas las filas son de la temporada actual', (SELECT count(*) FROM v_tabla_posiciones WHERE temporada_id <> :tact), 0);
SELECT pg_temp.esperar('lugar 1: mas puntos', pg_temp.lugar(:ea), 1);
SELECT pg_temp.esperar('lugar 2: empate en puntos y dg, gana mas goles a favor', pg_temp.lugar(:eb), 2);
SELECT pg_temp.esperar('lugar 3: el de menos goles a favor', pg_temp.lugar(:ec), 3);
SELECT min(nombre) AS n_primero FROM equipo WHERE id IN (:ed,:ee) \gset
SELECT pg_temp.esperar('lugar 4: empate total, gana el nombre menor', pg_temp.lugar((SELECT id FROM equipo WHERE id IN (:ed,:ee) AND nombre=:'n_primero')), 4);
SELECT pg_temp.esperar('lugar 5: empate total, el nombre mayor', pg_temp.lugar((SELECT id FROM equipo WHERE id IN (:ed,:ee) AND nombre<>:'n_primero')), 5);
SELECT pg_temp.esperar('lugar 6: equipo sin partidos', pg_temp.lugar(:ef), 6);
SELECT pg_temp.esperar('los lugares son 1..6 sin repetir', (SELECT count(DISTINCT lugar) FROM v_tabla_posiciones WHERE lugar BETWEEN 1 AND 6), 6);
SELECT pg_temp.esperar('lugar es INTEGER (no bigint)', (SELECT count(*) FROM (SELECT pg_typeof(lugar) t FROM v_tabla_posiciones LIMIT 1) x WHERE t = 'integer'::regtype), 1);
SELECT pg_temp.esperar('la vista trae el nombre del equipo', (SELECT count(*) FROM v_tabla_posiciones v JOIN equipo e ON e.id=v.equipo_id WHERE e.nombre = v.nombre), 6);

-- La vista refleja al instante los cambios de posicion
UPDATE posicion SET pg=3, pe=0, gf=8, gc=2, dg=6, puntos=9 WHERE equipo_id = :ec;   -- c empata en puntos con a, pero dg 6 < 9
SELECT pg_temp.esperar('c sube a lugar 2 tras recalcularse', pg_temp.lugar(:ec), 2);
SELECT pg_temp.esperar('b baja a lugar 3', pg_temp.lugar(:eb), 3);

-- Solo lectura
SELECT pg_temp.debe_fallar('INSERT sobre la vista', format('INSERT INTO v_tabla_posiciones(temporada_id,equipo_id,nombre,pj,pg,pe,pp,gf,gc,dg,puntos,lugar) VALUES (%s,%s,''x'',0,0,0,0,0,0,0,0,1)', :tact, :ea), '55000');
SELECT pg_temp.debe_fallar('UPDATE sobre la vista', 'UPDATE v_tabla_posiciones SET puntos = 99', '55000');
SELECT pg_temp.debe_fallar('DELETE sobre la vista', 'DELETE FROM v_tabla_posiciones', '55000');
SELECT pg_temp.esperar('despues de los intentos nada cambio', (SELECT count(*) FROM posicion WHERE puntos = 99), 0);

-- Cambio de temporada actual: la vista sigue a temporada.actual
UPDATE temporada SET actual = FALSE WHERE actual;
SELECT pg_temp.esperar('sin temporada actual la vista esta vacia', (SELECT count(*) FROM v_tabla_posiciones), 0);
UPDATE temporada SET actual = TRUE WHERE id = :totra;
SELECT pg_temp.esperar('con otra temporada actual aparece solo su equipo', (SELECT count(*) FROM v_tabla_posiciones), 1);
SELECT pg_temp.esperar('...y su lugar es 1', pg_temp.lugar(:eotra), 1);
ROLLBACK;
SELECT pg_temp.esperar('despues del ROLLBACK la temporada actual sigue igual', (SELECT count(*) FROM temporada WHERE actual), 1);
\echo 'Vista v_tabla_posiciones (DB-7.1) verificada.'
