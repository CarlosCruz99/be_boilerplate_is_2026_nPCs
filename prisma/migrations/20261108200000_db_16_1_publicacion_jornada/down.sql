-- Revierte DB-16.1. Se pierde quién y cuándo publicó cada jornada; el estado, las
-- jornadas y los partidos no se tocan.
ALTER TABLE "jornada"
  DROP CONSTRAINT IF EXISTS "ck_jornada_publicacion",
  DROP CONSTRAINT IF EXISTS "jornada_publicada_por_fkey",
  DROP COLUMN IF EXISTS "publicada_por",
  DROP COLUMN IF EXISTS "publicada_en";
