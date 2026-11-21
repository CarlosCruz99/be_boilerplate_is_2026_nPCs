-- Revierte DB-15.1. Se pierde el historial de cambios y las entregas de correo.
-- Los partidos, los avisos internos (tabla aviso) y los usuarios no se tocan.
DROP TABLE IF EXISTS "entrega_correo";
DROP TABLE IF EXISTS "cambio_partido";
DROP TYPE IF EXISTS "estado_entrega_correo";
DROP TYPE IF EXISTS "campo_cambio_partido";
