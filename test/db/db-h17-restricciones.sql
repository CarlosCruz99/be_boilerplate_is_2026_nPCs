-- Verifica DB-17.1: tabla contenido_galeria, limite de 30 activos, indices y paginacion.
-- Requiere los seeds de H1 y DB-3.2. No deja datos: todo corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h17-restricciones.sql
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

-- Inserta un contenido valido (foto jpeg de 1000 bytes) con un overrides minimo.
CREATE FUNCTION pg_temp.ins(partido int, usuario uuid, clave text, tipo text DEFAULT 'FOTO', mime text DEFAULT 'image/jpeg',
                            bytes int DEFAULT 1000, descr text DEFAULT NULL, estado text DEFAULT 'ACTIVO') RETURNS text AS $$
  SELECT format($q$INSERT INTO contenido_galeria(id,partido_id,tipo,storage_key,nombre_original,mime_type,tamano_bytes,descripcion,subido_por,estado,eliminado_en,eliminado_por)
                   VALUES (gen_random_uuid(),%s,%L,%L,'archivo.bin',%L,%s,%L,%L,%L,CASE WHEN %L='ELIMINADO' THEN now() END,CASE WHEN %L='ELIMINADO' THEN %L::uuid END)$q$,
                   partido, tipo, clave, mime, bytes, descr, usuario, estado, estado, estado, usuario)
$$ LANGUAGE sql;

SELECT pg_temp.esperar('tabla contenido_galeria creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='contenido_galeria'), 1);
SELECT pg_temp.esperar('indices de galeria', (SELECT count(*) FROM pg_indexes WHERE tablename='contenido_galeria'
  AND indexname IN ('ix_galeria_partido_fecha','ix_galeria_activos','contenido_galeria_storage_key_key')), 3);
SELECT pg_temp.esperar('no hay columna binaria en la tabla', (SELECT count(*) FROM information_schema.columns WHERE table_name='contenido_galeria' AND data_type='bytea'), 0);

BEGIN;
-- Un partido sin contenido (los del seed ya tienen 30 y 1).
SELECT p.id AS p FROM partido p WHERE NOT EXISTS (SELECT 1 FROM contenido_galeria g WHERE g.partido_id=p.id) ORDER BY p.id LIMIT 1 \gset
SELECT p.id AS p2 FROM partido p WHERE p.id<>:p AND NOT EXISTS (SELECT 1 FROM contenido_galeria g WHERE g.partido_id=p.id) ORDER BY p.id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset

-- Metadatos asociados al partido y al usuario correctos
SELECT pg_temp.esperar('contenido valido', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-1')), 1);
SELECT pg_temp.esperar('asociado al partido y al usuario que publico', (SELECT count(*) FROM contenido_galeria WHERE storage_key='k-1' AND partido_id=:p AND subido_por=:'org' AND estado='ACTIVO'), 1);
SELECT pg_temp.esperar('creado_en se llena solo', (SELECT count(*) FROM contenido_galeria WHERE storage_key='k-1' AND creado_en IS NOT NULL), 1);

-- Referencias
SELECT pg_temp.debe_fallar('partido inexistente', pg_temp.ins(0, :'org', 'k-x1'), '23503');
SELECT pg_temp.debe_fallar('usuario inexistente', pg_temp.ins(:p, gen_random_uuid(), 'k-x2'), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar un partido con contenido', format('DELETE FROM partido WHERE id=%s', :p), '23503');
SELECT pg_temp.debe_fallar('no se puede borrar al usuario que publico', format('DELETE FROM usuario WHERE id=%L', :'org'), '23503');

-- Descripcion
SELECT pg_temp.esperar('descripcion de exactamente 200 caracteres', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-d200', 'FOTO', 'image/jpeg', 1000, repeat('x', 200))), 1);
SELECT pg_temp.debe_fallar('descripcion de 201 caracteres', pg_temp.ins(:p, :'org', 'k-d201', 'FOTO', 'image/jpeg', 1000, repeat('x', 201)), '22001');
SELECT pg_temp.esperar('descripcion nula', (SELECT count(*) FROM contenido_galeria WHERE storage_key='k-1' AND descripcion IS NULL), 1);
SELECT pg_temp.esperar('CHECK de longitud de descripcion definido', (SELECT count(*) FROM pg_constraint WHERE conname='ck_galeria_descripcion'), 1);

-- Formato y tamaño
SELECT pg_temp.esperar('foto PNG', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-png', 'FOTO', 'image/png')), 1);
SELECT pg_temp.esperar('video MP4', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-mp4', 'VIDEO', 'video/mp4', 20000000)), 1);
SELECT pg_temp.debe_fallar('foto con MIME de video', pg_temp.ins(:p, :'org', 'k-m1', 'FOTO', 'video/mp4'), '23514');
SELECT pg_temp.debe_fallar('video con MIME de imagen', pg_temp.ins(:p, :'org', 'k-m2', 'VIDEO', 'image/png'), '23514');
SELECT pg_temp.debe_fallar('ejecutable', pg_temp.ins(:p, :'org', 'k-m3', 'FOTO', 'application/x-msdownload'), '23514');
SELECT pg_temp.debe_fallar('foto GIF', pg_temp.ins(:p, :'org', 'k-m4', 'FOTO', 'image/gif'), '23514');
SELECT pg_temp.debe_fallar('tamano cero', pg_temp.ins(:p, :'org', 'k-t0', 'FOTO', 'image/jpeg', 0), '23514');
SELECT pg_temp.debe_fallar('tamano negativo', pg_temp.ins(:p, :'org', 'k-t1', 'FOTO', 'image/jpeg', -1), '23514');
SELECT pg_temp.esperar('foto de exactamente 5 MiB', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-5m', 'FOTO', 'image/jpeg', 5242880)), 1);
SELECT pg_temp.debe_fallar('foto de 5 MiB + 1 byte', pg_temp.ins(:p, :'org', 'k-5m1', 'FOTO', 'image/jpeg', 5242881), '23514');
SELECT pg_temp.esperar('video de exactamente 50 MiB', pg_temp.filas(pg_temp.ins(:p, :'org', 'k-50m', 'VIDEO', 'video/mp4', 52428800)), 1);
SELECT pg_temp.debe_fallar('video de 50 MiB + 1 byte', pg_temp.ins(:p, :'org', 'k-50m1', 'VIDEO', 'video/mp4', 52428801), '23514');
SELECT pg_temp.debe_fallar('tipo fuera de la lista', replace(pg_temp.ins(:p, :'org', 'k-t2'), $$'FOTO'$$, $$'AUDIO'$$), '22P02');

-- Clave de almacenamiento
SELECT pg_temp.debe_fallar('storage_key repetida', pg_temp.ins(:p2, :'org', 'k-1'), '23505');
SELECT pg_temp.debe_fallar('storage_key vacia', pg_temp.ins(:p, :'org', '   '), '23514');

-- Borrado logico
SELECT pg_temp.debe_fallar('ELIMINADO sin quien ni cuando', format($q$UPDATE contenido_galeria SET estado='ELIMINADO' WHERE storage_key='k-1'$q$), '23514');
SELECT pg_temp.debe_fallar('ACTIVO con fecha de eliminacion', format($q$UPDATE contenido_galeria SET eliminado_en=now() WHERE storage_key='k-1'$q$), '23514');
SELECT pg_temp.esperar('borrado logico con quien y cuando', pg_temp.filas(format($q$UPDATE contenido_galeria SET estado='ELIMINADO', eliminado_en=now(), eliminado_por=%L WHERE storage_key='k-1'$q$, :'org')), 1);
SELECT pg_temp.esperar('el registro eliminado se conserva (trazabilidad)', (SELECT count(*) FROM contenido_galeria WHERE storage_key='k-1' AND estado='ELIMINADO' AND eliminado_por=:'org'), 1);
SELECT pg_temp.debe_fallar('eliminado_por inexistente', format($q$UPDATE contenido_galeria SET eliminado_por=gen_random_uuid() WHERE storage_key='k-1'$q$), '23503');
ROLLBACK;

-- Limite de 30 activos
BEGIN;
SELECT p.id AS p FROM partido p WHERE NOT EXISTS (SELECT 1 FROM contenido_galeria g WHERE g.partido_id=p.id) ORDER BY p.id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
INSERT INTO contenido_galeria(id,partido_id,tipo,storage_key,nombre_original,mime_type,tamano_bytes,subido_por)
  SELECT gen_random_uuid(), :p, 'FOTO', 'lim-'||g, 'f.jpg', 'image/jpeg', 1000, :'org' FROM generate_series(1,30) g;
SELECT pg_temp.esperar('30 activos caben', (SELECT count(*) FROM contenido_galeria WHERE partido_id=:p AND estado='ACTIVO'), 30);
SELECT pg_temp.debe_fallar('el 31.o activo se rechaza', pg_temp.ins(:p, :'org', 'lim-31'), '23514');
UPDATE contenido_galeria SET estado='ELIMINADO', eliminado_en=now(), eliminado_por=:'org' WHERE storage_key='lim-1';
SELECT pg_temp.esperar('un eliminado no cuenta: quedan 29 activos', (SELECT count(*) FROM contenido_galeria WHERE partido_id=:p AND estado='ACTIVO'), 29);
SELECT pg_temp.esperar('con 29 activos entra uno mas', pg_temp.filas(pg_temp.ins(:p, :'org', 'lim-32')), 1);
SELECT pg_temp.debe_fallar('reactivar un eliminado con 30 activos', 'UPDATE contenido_galeria SET estado=''ACTIVO'', eliminado_en=NULL, eliminado_por=NULL WHERE storage_key=''lim-1''', '23514');
SELECT pg_temp.esperar('eliminados no limitan: se pueden insertar mas eliminados', pg_temp.filas(pg_temp.ins(:p, :'org', 'lim-33', 'FOTO', 'image/jpeg', 1000, NULL, 'ELIMINADO')), 1);
-- Paginacion por cursor (partido_id, creado_en DESC, id DESC), con fechas repetidas
UPDATE contenido_galeria SET creado_en = timestamptz '2026-11-01 15:00:00+00' + (floor((substring(storage_key from 5)::int - 1) / 3.0) * interval '1 minute') WHERE partido_id=:p AND storage_key ~ '^lim-[0-9]+$';
CREATE TEMP TABLE pag(n int, ids uuid[]) ON COMMIT DROP;
DO $$
DECLARE pid int; cur_f timestamptz; cur_i uuid; pagina uuid[]; k int := 0;
BEGIN
  SELECT id INTO pid FROM partido p WHERE EXISTS (SELECT 1 FROM contenido_galeria g WHERE g.partido_id=p.id AND g.storage_key='lim-2');
  LOOP
    SELECT array_agg(id ORDER BY creado_en DESC, id DESC) INTO pagina FROM (
      SELECT id, creado_en FROM contenido_galeria
       WHERE partido_id=pid AND estado='ACTIVO' AND (cur_f IS NULL OR (creado_en, id) < (cur_f, cur_i))
       ORDER BY creado_en DESC, id DESC LIMIT 10) q;
    EXIT WHEN pagina IS NULL;
    k := k + 1; INSERT INTO pag VALUES (k, pagina);
    SELECT creado_en, id INTO cur_f, cur_i FROM contenido_galeria WHERE id = pagina[array_length(pagina,1)];
  END LOOP;
END $$;
SELECT pg_temp.esperar('paginas de 10 sobre 30 activos', (SELECT count(*) FROM pag), 3);
SELECT pg_temp.esperar('la paginacion no repite ni omite elementos', (SELECT count(DISTINCT x) FROM pag, unnest(ids) x), 30);
SELECT pg_temp.esperar('total de elementos paginados', (SELECT sum(array_length(ids,1)) FROM pag), 30);
ROLLBACK;

-- Indices: el plan los usa con muchos datos (tabla temporal de 20 000 filas con los mismos indices)
BEGIN;
CREATE TEMP TABLE g_grande (id uuid, partido_id int, creado_en timestamptz, estado text) ON COMMIT DROP;
INSERT INTO g_grande SELECT gen_random_uuid(), 1 + (g % 200), timestamptz '2026-01-01' + g * interval '1 minute', CASE WHEN g % 7 = 0 THEN 'ELIMINADO' ELSE 'ACTIVO' END FROM generate_series(1,20000) g;
CREATE INDEX ON g_grande (partido_id, creado_en DESC, id DESC);
ANALYZE g_grande;
CREATE FUNCTION pg_temp.plan_galeria() RETURNS text AS $$
DECLARE linea text; res text := '';
BEGIN
  FOR linea IN EXPLAIN SELECT * FROM g_grande WHERE partido_id = 7 AND estado = 'ACTIVO' ORDER BY creado_en DESC, id DESC LIMIT 10 LOOP res := res || linea || E'\n'; END LOOP;
  RETURN res;
END $$ LANGUAGE plpgsql;
SELECT pg_temp.plan_galeria() AS plan \gset
SELECT pg_temp.esperar('el orden por fecha y paginacion usa el indice (sin Sort)', (position('Index Scan' in :'plan') > 0 AND position('Sort' in :'plan') = 0)::int, 1);
ROLLBACK;

SELECT pg_temp.esperar('despues de las pruebas no quedan filas de prueba', (SELECT count(*) FROM contenido_galeria WHERE storage_key LIKE 'k-%' OR storage_key LIKE 'lim-%'), 0);
\echo 'Galeria de contenido (DB-17.1) verificada.'
