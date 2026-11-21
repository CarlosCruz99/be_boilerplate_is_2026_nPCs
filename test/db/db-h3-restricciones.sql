-- Pruebas de DB-3.1: choques de cancha y árbitro, cruces repetidos, duración,
-- llaves compuestas y Cancelado. Una prueba por criterio de aceptación.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h3-restricciones.sql
-- Corre dentro de una transacción con ROLLBACK: no deja datos.
BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK    % -> %', caso, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALLO %: debio fallar y paso', caso;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.debe_pasar(caso text, sentencia text) RETURNS void AS $$
BEGIN
  EXECUTE sentencia; RAISE NOTICE 'OK    % (paso, como se esperaba)', caso;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'FALLO %: debio pasar y fallo con %', caso, SQLERRM;
END $$ LANGUAGE plpgsql;

-- ---------- Datos base: 2 temporadas, 4 equipos en la 1, 1 en la 2, 2 árbitros, 2 canchas ----------
INSERT INTO usuario (id,email,password_hash,updated_at,nombre,fecha_nacimiento,rol) VALUES
 ('00000000-0000-0000-0000-0000000000a1','capA@t.com','h',now(),'Cap A','1990-01-01','JUGADOR'),
 ('00000000-0000-0000-0000-0000000000a2','capB@t.com','h',now(),'Cap B','1990-01-01','JUGADOR'),
 ('00000000-0000-0000-0000-0000000000a3','capC@t.com','h',now(),'Cap C','1990-01-01','JUGADOR'),
 ('00000000-0000-0000-0000-0000000000a4','capD@t.com','h',now(),'Cap D','1990-01-01','JUGADOR'),
 ('00000000-0000-0000-0000-0000000000a5','capE@t.com','h',now(),'Cap E','1990-01-01','JUGADOR'),
 ('00000000-0000-0000-0000-0000000000b1','arb1@t.com','h',now(),'Arbitro Uno','1985-01-01','ARBITRO'),
 ('00000000-0000-0000-0000-0000000000b2','arb2@t.com','h',now(),'Arbitro Dos','1985-01-01','ARBITRO');
INSERT INTO temporada (id,nombre,fecha_inicio,fecha_fin) VALUES (8001,'T3-A','2030-01-01','2030-03-01'),(8002,'T3-B','2030-06-01','2030-08-01');
INSERT INTO equipo (id,nombre,temporada_id,capitan_id) VALUES
 (8101,'EqA',8001,'00000000-0000-0000-0000-0000000000a1'),
 (8102,'EqB',8001,'00000000-0000-0000-0000-0000000000a2'),
 (8103,'EqC',8001,'00000000-0000-0000-0000-0000000000a3'),
 (8104,'EqD',8001,'00000000-0000-0000-0000-0000000000a4'),
 (8105,'EqE',8002,'00000000-0000-0000-0000-0000000000a5');
INSERT INTO cancha (id,nombre,direccion) VALUES (8201,'Cancha Uno','Dir 1'),(8202,'Cancha Dos','Dir 2');
INSERT INTO jornada (id,temporada_id,numero) VALUES (8301,8001,1),(8302,8001,2),(8303,8002,1);

-- Plantilla de partido: p(local, visitante, cancha, arbitro, inicio, fin, jornada, temporada)
CREATE FUNCTION pg_temp.ins(loc int, vis int, can int, arb text, ini text, fin text, jor int DEFAULT 8301, temp int DEFAULT 8001) RETURNS text AS $f$
  SELECT format($q$INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin)
    VALUES (%s,%s,%s,%s,%s,%s,%L,%L)$q$, temp, jor, loc, vis, can, coalesce(quote_literal(arb),'NULL'), ini, fin)
$f$ LANGUAGE sql;

\set A1 '00000000-0000-0000-0000-0000000000b1'
\set A2 '00000000-0000-0000-0000-0000000000b2'

-- 1. Partido base: A vs B, cancha 1, árbitro 1, 08:00-09:30 (El Salvador = 14:00-15:30 UTC)
SELECT pg_temp.debe_pasar('base: partido valido',
  pg_temp.ins(8101,8102,8201,:'A1','2030-01-05 14:00+00','2030-01-05 15:30+00'));

-- 2. Misma cancha con horario traslapado falla; consecutivo sin traslape funciona
SELECT pg_temp.debe_fallar('misma cancha, horario traslapado',
  pg_temp.ins(8103,8104,8201,:'A2','2030-01-05 15:00+00','2030-01-05 16:30+00'));
SELECT pg_temp.debe_pasar('misma cancha, consecutivo (09:30 pegado)',
  pg_temp.ins(8103,8104,8201,:'A2','2030-01-05 15:30+00','2030-01-05 17:00+00'));

-- 3. Mismo árbitro traslapado falla; consecutivo funciona (cancha distinta para aislar la regla)
SELECT pg_temp.debe_fallar('mismo arbitro, horario traslapado',
  pg_temp.ins(8101,8103,8202,:'A1','2030-01-05 15:00+00','2030-01-05 16:30+00'));
SELECT pg_temp.debe_pasar('mismo arbitro, consecutivo, otra cancha',
  pg_temp.ins(8101,8104,8202,:'A1','2030-01-05 15:30+00','2030-01-05 17:00+00',8301));
SELECT pg_temp.debe_pasar('misma hora en dos canchas con dos arbitros',
  pg_temp.ins(8102,8103,8202,:'A2','2030-01-05 14:00+00','2030-01-05 15:30+00'));

-- 4. Sin árbitro falla
SELECT pg_temp.debe_fallar('partido sin arbitro',
  pg_temp.ins(8102,8104,8201,NULL,'2030-01-12 14:00+00','2030-01-12 15:30+00',8302));

-- 5. Mismo equipo como local y visitante falla
SELECT pg_temp.debe_fallar('mismo equipo local y visitante',
  pg_temp.ins(8102,8102,8201,:'A1','2030-01-12 14:00+00','2030-01-12 15:30+00',8302));

-- 6. A vs B y luego B vs A en la misma temporada falla
SELECT pg_temp.debe_fallar('cruce B vs A (ya existe A vs B)',
  pg_temp.ins(8102,8101,8201,:'A1','2030-01-12 14:00+00','2030-01-12 15:30+00',8302));

-- 7. Duración distinta de 90 minutos falla
SELECT pg_temp.debe_fallar('duracion de 60 minutos',
  pg_temp.ins(8102,8104,8201,:'A1','2030-01-12 14:00+00','2030-01-12 15:00+00',8302));
SELECT pg_temp.debe_fallar('duracion de 120 minutos',
  pg_temp.ins(8102,8104,8201,:'A1','2030-01-12 14:00+00','2030-01-12 16:00+00',8302));

-- 8. Equipo de otra temporada falla
SELECT pg_temp.debe_fallar('equipo visitante de otra temporada',
  pg_temp.ins(8102,8105,8201,:'A1','2030-01-12 14:00+00','2030-01-12 15:30+00',8302));

-- 9. "Cancha 1" y "CANCHA 1" no pueden coexistir
SELECT pg_temp.debe_fallar('cancha con el mismo nombre en mayusculas',
  $q$INSERT INTO cancha(nombre,direccion) VALUES ('CANCHA UNO','Otra')$q$);

-- 10. Cancelar libera cancha, árbitro y cruce
UPDATE partido SET estado='CANCELADO' WHERE equipo_local_id=8101 AND equipo_visitante_id=8102;
SELECT pg_temp.debe_pasar('tras cancelar: misma cancha, mismo arbitro, mismo horario',
  pg_temp.ins(8104,8102,8201,:'A1','2030-01-05 14:00+00','2030-01-05 15:30+00'));
SELECT pg_temp.debe_pasar('tras cancelar: mismo cruce A vs B se puede volver a agendar',
  pg_temp.ins(8101,8102,8201,:'A2','2030-01-19 14:00+00','2030-01-19 15:30+00',8302));

-- 11. Dos jornadas con el mismo número en una temporada fallan
SELECT pg_temp.debe_fallar('jornada 1 repetida en la misma temporada',
  $q$INSERT INTO jornada(temporada_id,numero) VALUES (8001,1)$q$);
SELECT pg_temp.debe_pasar('jornada 1 en otra temporada es valida',
  $q$INSERT INTO jornada(temporada_id,numero) VALUES (8002,5)$q$);
SELECT pg_temp.debe_fallar('jornada con numero 0',
  $q$INSERT INTO jornada(temporada_id,numero) VALUES (8001,0)$q$);

-- 12. Partido con una jornada de otra temporada falla
SELECT pg_temp.debe_fallar('jornada de otra temporada',
  pg_temp.ins(8101,8103,8201,:'A1','2030-02-02 14:00+00','2030-02-02 15:30+00',8303,8001));

-- Extras: estado por defecto y de la jornada
SELECT pg_temp.debe_pasar('estado por defecto: PROGRAMADO y BORRADOR', $q$
  DO $x$ BEGIN
    IF (SELECT estado FROM partido WHERE equipo_local_id=8103 AND cancha_id=8201 ORDER BY id LIMIT 1) <> 'PROGRAMADO' THEN RAISE EXCEPTION 'partido'; END IF;
    IF (SELECT estado FROM jornada WHERE id=8301) <> 'BORRADOR' THEN RAISE EXCEPTION 'jornada'; END IF;
  END $x$ $q$);

ROLLBACK;
\echo 'Todas las pruebas de DB-3.1 pasaron.'
