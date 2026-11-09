-- DB-20.1: tabla aviso (una fila por destinatario) y sus tipos enumerados.
-- Escrita a mano: Prisma no expresa los CHECK ni el índice parcial de no leídos.
-- Solo depende de la tabla usuario (DB-1.3). Solo el servicio de BE-20.1 escribe en ella.
CREATE TYPE "modulo_origen_aviso" AS ENUM ('CALENDARIO', 'PAGOS', 'RESULTADOS');
CREATE TYPE "tipo_aviso" AS ENUM (
  'PARTIDO_MODIFICADO', 'JORNADA_PUBLICADA',
  'CUOTA_REGISTRADA', 'PAGO_REGISTRADO',
  'RESULTADO_FINALIZADO', 'RESULTADO_CORREGIDO'
);
CREATE TYPE "referencia_aviso" AS ENUM ('PARTIDO', 'JORNADA', 'CUOTA', 'PAGO');

CREATE TABLE "aviso" (
  "id" SERIAL NOT NULL,
  "usuario_id" UUID NOT NULL,
  "modulo_origen" "modulo_origen_aviso" NOT NULL,
  "tipo" "tipo_aviso" NOT NULL,
  "titulo" VARCHAR(120) NOT NULL,
  "mensaje" VARCHAR(500) NOT NULL,
  "referencia_tipo" "referencia_aviso",
  "referencia_id" INTEGER,
  "clave_idempotencia" VARCHAR(100),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "leido_en" TIMESTAMPTZ(3),
  "datos" JSONB,
  CONSTRAINT "aviso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "aviso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_aviso_titulo" CHECK (char_length(btrim("titulo")) > 0),
  CONSTRAINT "ck_aviso_mensaje" CHECK (char_length(btrim("mensaje")) > 0),
  -- La referencia va completa (tipo e id) o no va.
  CONSTRAINT "ck_aviso_referencia" CHECK (("referencia_tipo" IS NULL) = ("referencia_id" IS NULL)),
  CONSTRAINT "ck_aviso_leido" CHECK ("leido_en" IS NULL OR "leido_en" >= "creado_en"),
  CONSTRAINT "ck_aviso_datos" CHECK (octet_length("datos"::text) <= 2048)
);

-- Un reintento con la misma clave no duplica el aviso. Varios avisos sin clave son válidos
-- (en PostgreSQL los NULL no chocan entre sí). Es la clave que usa H16: jornada-{id}-capitan-{usuarioId}.
CREATE UNIQUE INDEX "aviso_usuario_id_clave_idempotencia_key" ON "aviso"("usuario_id", "clave_idempotencia");
-- Bandeja (H19): avisos de un usuario, los más recientes primero.
CREATE INDEX "ix_aviso_usuario_fecha" ON "aviso"("usuario_id", "creado_en" DESC);
-- Contador de no leídos: el índice solo contiene las filas pendientes.
CREATE INDEX "ix_aviso_no_leidos" ON "aviso"("usuario_id") WHERE "leido_en" IS NULL;
