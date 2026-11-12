-- Revierte DB-13.1. Se pierden los pagos; las cuotas, partidos y equipos no se tocan.
-- Si DB-24.1 ya agregó columnas de revisión a pago, revierte primero DB-24.1.
DROP FUNCTION IF EXISTS "fn_saldo_cuota"(INTEGER);
DROP TRIGGER IF EXISTS "tr_pago_no_supera_cuota" ON "pago";
DROP FUNCTION IF EXISTS "fn_pago_no_supera_cuota"();
DROP TABLE IF EXISTS "pago";
DROP TYPE IF EXISTS "estado_pago";
