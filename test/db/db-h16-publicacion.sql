-- Verifica DB-16.1: publicación de jornadas (quién y cuándo) y su CHECK.
-- Requiere el seed de DB-3.2. No deja datos: todo corre dentro de una transacción que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h16-publicacion.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido;
  END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- Ejecuta una sentencia que DEBE fallar con el codigo SQLSTATE indicado (23514 check, 23503 FK).
CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo OR (codigo = '23503' AND SQLSTATE = '23001') THEN
      RAISE NOTICE 'OK    % (rechazado: %)', caso, SQLSTATE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FALLO %: fallo por otro motivo (%): %', caso, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO %: la sentencia NO fue rechazada', caso;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('columnas de publicacion creadas', (SELECT count(*) FROM information_schema.columns
  WHERE table_name='jornada' AND column_name IN ('publicada_en','publicada_por')), 2);
SELECT pg_temp.esperar('restriccion ck_jornada_publicacion', (SELECT count(*) FROM pg_constraint WHERE conname='ck_jornada_publicacion'), 1);

-- Estado del seed
SELECT pg_temp.esperar('jornadas Publicadas con fecha y autor', (SELECT count(*) FROM jornada
  WHERE estado='PUBLICADA' AND publicada_en IS NOT NULL AND publicada_por IS NOT NULL), (SELECT count(*) FROM jornada WHERE estado='PUBLICADA'));
SELECT pg_temp.esperar('jornadas en Borrador sin fecha ni autor', (SELECT count(*) FROM jornada
  WHERE estado='BORRADOR' AND publicada_en IS NULL AND publicada_por IS NULL), (SELECT count(*) FROM jornada WHERE estado='BORRADOR'));

-- Publicar una jornada en Borrador: debe quedar con fecha y autor
BEGIN;
SELECT j.id AS jid FROM jornada j WHERE j.estado='BORRADOR' ORDER BY j.id LIMIT 1 \gset
SELECT id AS org FROM usuario WHERE rol='ORGANIZADOR' ORDER BY email LIMIT 1 \gset
SELECT id AS jug FROM usuario WHERE rol='JUGADOR' ORDER BY email LIMIT 1 \gset

SELECT pg_temp.debe_fallar('Publicada sin fecha ni autor',
  format('UPDATE jornada SET estado=''PUBLICADA'' WHERE id=%s', :jid), '23514');
SELECT pg_temp.debe_fallar('Publicada con fecha pero sin autor',
  format('UPDATE jornada SET estado=''PUBLICADA'', publicada_en=now() WHERE id=%s', :jid), '23514');
SELECT pg_temp.debe_fallar('Publicada con autor pero sin fecha',
  format('UPDATE jornada SET estado=''PUBLICADA'', publicada_por=%L WHERE id=%s', :'org', :jid), '23514');
SELECT pg_temp.debe_fallar('Borrador con fecha de publicacion',
  format('UPDATE jornada SET publicada_en=now() WHERE id=%s', :jid), '23514');
SELECT pg_temp.debe_fallar('Borrador con autor de publicacion',
  format('UPDATE jornada SET publicada_por=%L WHERE id=%s', :'org', :jid), '23514');
SELECT pg_temp.debe_fallar('autor que no existe',
  format('UPDATE jornada SET estado=''PUBLICADA'', publicada_en=now(), publicada_por=%L WHERE id=%s', gen_random_uuid(), :jid), '23503');

SELECT pg_temp.esperar('tras los rechazos la jornada sigue en Borrador', (SELECT count(*) FROM jornada WHERE id=:jid AND estado='BORRADOR'), 1);

UPDATE jornada SET estado='PUBLICADA', publicada_en=now(), publicada_por=:'org' WHERE id=:jid;
SELECT pg_temp.esperar('publicar con fecha y autor funciona', (SELECT count(*) FROM jornada WHERE id=:jid AND estado='PUBLICADA'), 1);

-- Un guardado que no publica no cambia la publicacion de las demas jornadas
SELECT pg_temp.esperar('solo cambio una jornada', (SELECT count(*) FROM jornada WHERE estado='PUBLICADA'), (SELECT count(*) FROM jornada WHERE publicada_en IS NOT NULL));

-- El autor de una publicacion no se puede borrar
SELECT pg_temp.debe_fallar('borrar al usuario que publico',
  format('DELETE FROM usuario WHERE id=%L', :'org'), '23503');
ROLLBACK;

SELECT pg_temp.esperar('despues del ROLLBACK la jornada sigue en Borrador', (SELECT count(*) FROM jornada WHERE estado='BORRADOR' AND publicada_en IS NULL),
  (SELECT count(*) FROM jornada WHERE estado='BORRADOR'));
SELECT pg_temp.esperar('partidos intactos', (SELECT count(*) FROM partido), 66);
\echo 'Publicacion de jornadas (DB-16.1) verificada.'
