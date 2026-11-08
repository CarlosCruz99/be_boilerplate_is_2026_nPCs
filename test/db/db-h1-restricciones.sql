-- Pruebas de restricciones de H1 (DB-1.1, DB-1.3, DB-2.1).
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/db/db-h1-restricciones.sql
-- Todo corre en una transaccion que termina en ROLLBACK: no deja datos.
BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK    % -> %', caso, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FALLO % : la sentencia debio fallar y paso', caso;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.debe_pasar(caso text, sentencia text) RETURNS void AS $$
BEGIN
  EXECUTE sentencia;
  RAISE NOTICE 'OK    % (paso, como se esperaba)', caso;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'FALLO % : debio pasar y fallo con %', caso, SQLERRM;
END $$ LANGUAGE plpgsql;

-- ---------- Datos base ----------
INSERT INTO usuario (id,email,password_hash,updated_at,nombre,fecha_nacimiento) VALUES
 ('00000000-0000-0000-0000-000000000001','t1@x.com','h',now(),'Capitan Uno','1995-01-01'),
 ('00000000-0000-0000-0000-000000000002','t2@x.com','h',now(),'Capitan Dos','1995-01-01'),
 ('00000000-0000-0000-0000-000000000003','t3@x.com','h',now(),'Org Tres','1990-01-01');
INSERT INTO temporada (id,nombre,fecha_inicio,fecha_fin) VALUES
 (9001,'T-A','2026-11-07','2027-01-16'),(9002,'T-B','2027-03-01','2027-06-30');
INSERT INTO equipo (id,nombre,temporada_id,capitan_id) VALUES
 (9101,'Tigres',9001,'00000000-0000-0000-0000-000000000001');
INSERT INTO jugador (id,nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES
 (9201,'Ana Lopez','2000-01-01','T-0001','/f.jpg'),(9202,'Beto Ruiz','2000-01-01','T-0002','/f.jpg');

-- ---------- DB-1.3 ----------
SELECT pg_temp.debe_fallar('1.3 rol fuera del enum',
  $q$INSERT INTO usuario(id,email,password_hash,updated_at,nombre,fecha_nacimiento,rol) VALUES (gen_random_uuid(),'r@x.com','h',now(),'Usuario prueba','2000-01-01','ADMIN')$q$);
SELECT pg_temp.debe_fallar('1.3 nombre de 2 caracteres',
  $q$INSERT INTO usuario(id,email,password_hash,updated_at,nombre,fecha_nacimiento) VALUES (gen_random_uuid(),'n@x.com','h',now(),'Ab','2000-01-01')$q$);
SELECT pg_temp.debe_fallar('1.3 nombre solo espacios',
  $q$INSERT INTO usuario(id,email,password_hash,updated_at,nombre,fecha_nacimiento) VALUES (gen_random_uuid(),'n2@x.com','h',now(),'    ','2000-01-01')$q$);
SELECT pg_temp.debe_fallar('1.3 fecha de nacimiento futura',
  $q$INSERT INTO usuario(id,email,password_hash,updated_at,nombre,fecha_nacimiento) VALUES (gen_random_uuid(),'f@x.com','h',now(),'Usuario prueba',CURRENT_DATE + 1)$q$);

-- ---------- DB-1.1 ----------
SELECT pg_temp.debe_fallar('1.1 mismo nombre con otra capitalizacion',
  $q$INSERT INTO equipo(nombre,temporada_id,capitan_id) VALUES ('TIGRES',9001,'00000000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.debe_pasar('1.1 mismo nombre en otra temporada',
  $q$INSERT INTO equipo(nombre,temporada_id,capitan_id) VALUES ('Tigres',9002,'00000000-0000-0000-0000-000000000001')$q$);
SELECT pg_temp.debe_fallar('1.1 un capitan, dos equipos en la misma temporada',
  $q$INSERT INTO equipo(nombre,temporada_id,capitan_id) VALUES ('Otro',9001,'00000000-0000-0000-0000-000000000001')$q$);
SELECT pg_temp.debe_fallar('1.1 fecha_fin anterior a fecha_inicio',
  $q$INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ('T-X','2027-01-02','2027-01-01')$q$);
SELECT pg_temp.debe_fallar('1.1 max_equipos < 2',
  $q$INSERT INTO temporada(nombre,fecha_inicio,fecha_fin,max_equipos) VALUES ('T-Y','2027-01-01','2027-02-01',1)$q$);

INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (9101,9201,9001);
SELECT pg_temp.debe_fallar('1.1 equipo_jugador con temporada distinta a la del equipo',
  $q$INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (9101,9202,9002)$q$);
INSERT INTO equipo(id,nombre,temporada_id,capitan_id) VALUES (9102,'Leones',9001,'00000000-0000-0000-0000-000000000002');
SELECT pg_temp.debe_fallar('1.1 mismo jugador en dos equipos de la misma temporada',
  $q$INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (9102,9201,9001)$q$);
INSERT INTO equipo(id,nombre,temporada_id,capitan_id) VALUES (9103,'Leones B',9002,'00000000-0000-0000-0000-000000000002');
SELECT pg_temp.debe_pasar('1.1 mismo jugador en otra temporada',
  $q$INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES (9103,9201,9002)$q$);

UPDATE jugador SET usuario_id='00000000-0000-0000-0000-000000000001' WHERE id=9201;
SELECT pg_temp.debe_fallar('1.1 dos jugadores con el mismo usuario_id',
  $q$UPDATE jugador SET usuario_id='00000000-0000-0000-0000-000000000001' WHERE id=9202$q$);
SELECT pg_temp.debe_pasar('1.1 jugador sin usuario_id es valido',
  $q$INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ('Sin Cuenta','2001-01-01','T-0003','/f.jpg')$q$);

UPDATE temporada SET actual = true WHERE id = 9001;
SELECT pg_temp.debe_fallar('1.1 dos temporadas con actual = TRUE',
  $q$UPDATE temporada SET actual = true WHERE id = 9002$q$);

-- ---------- DB-2.1 ----------
SELECT pg_temp.debe_fallar('2.1 RECHAZADO con motivo de 19 caracteres',
  $q$UPDATE equipo SET estado='RECHAZADO', validado_por='00000000-0000-0000-0000-000000000003', fecha_validacion=now(), motivo_rechazo='1234567890123456789' WHERE id=9101$q$);
SELECT pg_temp.debe_fallar('2.1 RECHAZADO con motivo vacio',
  $q$UPDATE equipo SET estado='RECHAZADO', validado_por='00000000-0000-0000-0000-000000000003', fecha_validacion=now(), motivo_rechazo='' WHERE id=9101$q$);
SELECT pg_temp.debe_fallar('2.1 INSCRITO sin validado_por',
  $q$UPDATE equipo SET estado='INSCRITO', fecha_validacion=now() WHERE id=9101$q$);
SELECT pg_temp.debe_fallar('2.1 validado_por con id inexistente',
  $q$UPDATE equipo SET estado='INSCRITO', validado_por=gen_random_uuid(), fecha_validacion=now() WHERE id=9101$q$);
SELECT pg_temp.debe_pasar('2.1 INSCRITO valido',
  $q$UPDATE equipo SET estado='INSCRITO', validado_por='00000000-0000-0000-0000-000000000003', fecha_validacion=now() WHERE id=9101$q$);
SELECT pg_temp.debe_pasar('2.1 RECHAZADO con motivo de 20 caracteres',
  $q$UPDATE equipo SET estado='RECHAZADO', validado_por='00000000-0000-0000-0000-000000000003', fecha_validacion=now(), motivo_rechazo='12345678901234567890' WHERE id=9101$q$);

ROLLBACK;
\echo 'Todas las pruebas de restricciones pasaron.'
