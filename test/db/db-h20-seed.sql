-- Verifica los datos de prueba de avisos (DB-20.1): A=45 (20 leidos, 25 sin leer), B=2, C=0.
-- Uso: docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h20-seed.sql
CREATE FUNCTION pg_temp.esperar(caso text, obtenido bigint, esperado bigint) RETURNS void AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'FALLO %: se esperaba % y hay %', caso, esperado, obtenido; END IF;
  RAISE NOTICE 'OK    % = %', caso, obtenido;
END $$ LANGUAGE plpgsql;

CREATE TEMP VIEW capitanes AS
  SELECT e.capitan_id, row_number() OVER (ORDER BY e.id) AS n
  FROM equipo e JOIN temporada t ON t.id = e.temporada_id WHERE t.nombre = 'Apertura 2026';

SELECT pg_temp.esperar('avisos del seed', (SELECT count(*) FROM aviso WHERE clave_idempotencia LIKE 'seed-aviso-%'), 47);
SELECT pg_temp.esperar('usuario A: 45 avisos', (SELECT count(*) FROM aviso a JOIN capitanes c ON c.capitan_id=a.usuario_id AND c.n=1), 45);
SELECT pg_temp.esperar('usuario A: 20 leidos', (SELECT count(*) FROM aviso a JOIN capitanes c ON c.capitan_id=a.usuario_id AND c.n=1 WHERE leido_en IS NOT NULL), 20);
SELECT pg_temp.esperar('usuario A: 25 sin leer', (SELECT count(*) FROM aviso a JOIN capitanes c ON c.capitan_id=a.usuario_id AND c.n=1 WHERE leido_en IS NULL), 25);
SELECT pg_temp.esperar('usuario B: 2 avisos', (SELECT count(*) FROM aviso a JOIN capitanes c ON c.capitan_id=a.usuario_id AND c.n=2), 2);
SELECT pg_temp.esperar('usuario C: ningun aviso', (SELECT count(*) FROM aviso a JOIN capitanes c ON c.capitan_id=a.usuario_id AND c.n=3), 0);
SELECT pg_temp.esperar('los 6 tipos estan representados', (SELECT count(DISTINCT tipo) FROM aviso), 6);
SELECT pg_temp.esperar('3 modulos de origen', (SELECT count(DISTINCT modulo_origen) FROM aviso), 3);
SELECT pg_temp.esperar('tipo corresponde a su modulo', (SELECT count(*) FROM aviso WHERE NOT (
  (modulo_origen='CALENDARIO' AND tipo IN ('PARTIDO_MODIFICADO','JORNADA_PUBLICADA')) OR
  (modulo_origen='PAGOS' AND tipo IN ('CUOTA_REGISTRADA','PAGO_REGISTRADO')) OR
  (modulo_origen='RESULTADOS' AND tipo IN ('RESULTADO_FINALIZADO','RESULTADO_CORREGIDO')))), 0);
\echo 'Seed de avisos verificado.'
