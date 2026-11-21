-- Revierte DB-17.1. Se pierden los metadatos de la galería; los partidos y usuarios no se tocan.
-- Los archivos físicos del almacenamiento local NO se borran: quedan como huérfanos en el servidor.
DROP TRIGGER IF EXISTS "tr_galeria_limite_activos" ON "contenido_galeria";
DROP FUNCTION IF EXISTS "fn_galeria_limite_activos"();
DROP TABLE IF EXISTS "contenido_galeria";
DROP TYPE IF EXISTS "estado_contenido_galeria";
DROP TYPE IF EXISTS "tipo_contenido_galeria";
