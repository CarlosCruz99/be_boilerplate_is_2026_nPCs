-- Reversión de DB-23.1: elimina la auditoría por completo (único borrado físico previsto).
DROP TRIGGER IF EXISTS "tr_correccion_partido_inmutable" ON "correccion_partido";
DROP FUNCTION IF EXISTS "fn_correccion_partido_inmutable"();
DROP TABLE IF EXISTS "correccion_partido";
