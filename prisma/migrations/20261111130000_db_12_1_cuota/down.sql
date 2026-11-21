-- Revierte DB-12.1. Se pierden las cuotas; si DB-13.1 ya creó pagos, revierte primero DB-13.1.
DROP TABLE IF EXISTS "cuota";
DROP TYPE IF EXISTS "concepto_cuota";
