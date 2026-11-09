-- Revierte DB-20.1. Borra la tabla aviso y sus avisos; si DB-16.1 ya la usa, revierte primero DB-16.1 en BE.
DROP TABLE IF EXISTS "aviso";
DROP TYPE IF EXISTS "referencia_aviso";
DROP TYPE IF EXISTS "tipo_aviso";
DROP TYPE IF EXISTS "modulo_origen_aviso";
