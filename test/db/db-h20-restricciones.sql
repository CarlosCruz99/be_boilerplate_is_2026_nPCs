-- Verifica las restricciones de la tabla aviso (DB-20.1). No deja datos: corre en una transaccion que se revierte.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h20-restricciones.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

-- La sentencia DEBE fallar con el SQLSTATE indicado: 23514 check, 23503 FK, 23505 unico,
-- 22P02 valor de enum invalido, 22001 texto demasiado largo.
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


-- Ejecuta un INSERT y devuelve cuantas filas inserto.
CREATE FUNCTION pg_temp.filas(sentencia text) RETURNS bigint AS $$
DECLARE n bigint;
BEGIN EXECUTE sentencia; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar('tabla aviso creada', (SELECT count(*) FROM information_schema.tables WHERE table_name='aviso'), 1);
SELECT pg_temp.esperar('3 tipos enumerados', (SELECT count(*) FROM pg_type WHERE typname IN ('modulo_origen_aviso','tipo_aviso','referencia_aviso')), 3);
SELECT pg_temp.esperar('indices de aviso', (SELECT count(*) FROM pg_indexes WHERE tablename='aviso'
  AND indexname IN ('ix_aviso_usuario_fecha','ix_aviso_no_leidos','aviso_usuario_id_clave_idempotencia_key')), 3);

BEGIN;
SELECT id AS u1 FROM usuario ORDER BY email LIMIT 1 \gset
SELECT id AS u2 FROM usuario ORDER BY email DESC LIMIT 1 \gset
-- Aviso base valido (usa un usuario real); los demas casos parten de el.
INSERT INTO aviso (usuario_id, modulo_origen, tipo, titulo, mensaje, clave_idempotencia)
VALUES (:'u1', 'CALENDARIO', 'JORNADA_PUBLICADA', 'Titulo', 'Mensaje', 'clave-1');
SELECT pg_temp.esperar('aviso valido insertado', (SELECT count(*) FROM aviso WHERE clave_idempotencia='clave-1'), 1);

SELECT pg_temp.debe_fallar('titulo vacio', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','','m')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('titulo de solo espacios', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','   ','m')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('titulo de mas de 120 caracteres', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA',repeat('x',121),'m')$q$, :'u1'), '22001');
SELECT pg_temp.debe_fallar('mensaje vacio', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('mensaje de solo espacios', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','  ')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('mensaje de mas de 500 caracteres', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t',repeat('x',501))$q$, :'u1'), '22001');
SELECT pg_temp.esperar('mensaje de exactamente 500 caracteres se acepta', pg_temp.filas(format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t',repeat('x',500))$q$, :'u1')), 1);

SELECT pg_temp.debe_fallar('modulo de origen fuera de la lista', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'OTRO','CUOTA_REGISTRADA','t','m')$q$, :'u1'), '22P02');
SELECT pg_temp.debe_fallar('tipo de aviso fuera de la lista', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','OTRO','t','m')$q$, :'u1'), '22P02');
SELECT pg_temp.debe_fallar('tipo de referencia fuera de la lista', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,referencia_tipo,referencia_id) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m','OTRA',1)$q$, :'u1'), '22P02');

SELECT pg_temp.debe_fallar('referencia con tipo y sin id', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,referencia_tipo) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m','CUOTA')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('referencia con id y sin tipo', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,referencia_id) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m',5)$q$, :'u1'), '23514');
SELECT pg_temp.esperar('referencia completa se acepta', pg_temp.filas(format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,referencia_tipo,referencia_id) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m','CUOTA',5)$q$, :'u1')), 1);

SELECT pg_temp.debe_fallar('misma clave para el mismo usuario', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,clave_idempotencia) VALUES (%L,'CALENDARIO','JORNADA_PUBLICADA','t','m','clave-1')$q$, :'u1'), '23505');
SELECT pg_temp.esperar('misma clave para otro usuario se acepta', pg_temp.filas(format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,clave_idempotencia) VALUES (%L,'CALENDARIO','JORNADA_PUBLICADA','t','m','clave-1')$q$, :'u2')), 1);
SELECT pg_temp.esperar('varios avisos sin clave son validos', pg_temp.filas(format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (%L,'PAGOS','PAGO_REGISTRADO','t','m'),(%L,'PAGOS','PAGO_REGISTRADO','t','m')$q$, :'u1', :'u1')), 2);

SELECT pg_temp.debe_fallar('usuario que no existe', $q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje) VALUES (gen_random_uuid(),'PAGOS','CUOTA_REGISTRADA','t','m')$q$, '23503');
SELECT pg_temp.debe_fallar('leido_en anterior a creado_en', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,creado_en,leido_en) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m',now(),now() - interval '1 hour')$q$, :'u1'), '23514');
SELECT pg_temp.debe_fallar('datos de mas de 2048 bytes', format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,datos) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m',jsonb_build_object('x',repeat('a',2100)))$q$, :'u1'), '23514');
SELECT pg_temp.esperar('datos pequenos se aceptan', pg_temp.filas(format($q$INSERT INTO aviso(usuario_id,modulo_origen,tipo,titulo,mensaje,datos) VALUES (%L,'PAGOS','CUOTA_REGISTRADA','t','m','{"a":1}')$q$, :'u1')), 1);
SELECT pg_temp.debe_fallar('borrar un usuario con avisos', format('DELETE FROM usuario WHERE id=%L', :'u1'), '23503');
ROLLBACK;
\echo 'Restricciones de aviso (DB-20.1) verificadas.'
