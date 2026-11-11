-- DB-15.1: cambios notificables de un partido y estado de la entrega del correo (H15).
-- El aviso interno NO se guarda aquí: lo guarda H20 (tabla aviso). Esta migración no toca partido.
CREATE TYPE "campo_cambio_partido" AS ENUM ('FECHA', 'HORA', 'CANCHA');
CREATE TYPE "estado_entrega_correo" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'OMITIDO');

CREATE TABLE "cambio_partido" (
  "id" SERIAL NOT NULL,
  "partido_id" INTEGER NOT NULL,
  "campo_modificado" "campo_cambio_partido" NOT NULL,
  "valor_anterior" TEXT NOT NULL,
  "valor_nuevo" TEXT NOT NULL,
  "modificado_por" UUID NOT NULL,
  "modificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "cambio_partido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cambio_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cambio_partido_modificado_por_fkey" FOREIGN KEY ("modificado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- No se crea evento si el valor nuevo es igual al anterior.
  CONSTRAINT "ck_cambio_valores_distintos" CHECK ("valor_nuevo" <> "valor_anterior"),
  -- Para la cancha se guarda su id (el nombre se obtiene por relación con cancha).
  CONSTRAINT "ck_cambio_cancha_id" CHECK ("campo_modificado" <> 'CANCHA' OR ("valor_anterior" ~ '^[0-9]+$' AND "valor_nuevo" ~ '^[0-9]+$'))
);
-- Historial de un partido, en orden.
CREATE INDEX "ix_cambio_partido_partido_fecha" ON "cambio_partido"("partido_id", "modificado_en");

-- Una fila por cambio y destinatario: el correo no se envía dos veces al mismo usuario.
-- La clave primaria (cambio_id, usuario_id) es la restricción única que pide el documento.
-- Un correo fallido deja el evento intacto (RESTRICT: un cambio con entregas no se borra).
CREATE TABLE "entrega_correo" (
  "cambio_id" INTEGER NOT NULL,
  "usuario_id" UUID NOT NULL,
  "estado" "estado_entrega_correo" NOT NULL DEFAULT 'PENDIENTE',
  "intentos" SMALLINT NOT NULL DEFAULT 0,
  "ultimo_intento_en" TIMESTAMPTZ(3),
  CONSTRAINT "entrega_correo_pkey" PRIMARY KEY ("cambio_id", "usuario_id"),
  CONSTRAINT "entrega_correo_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambio_partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entrega_correo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_entrega_intentos" CHECK ("intentos" >= 0)
);
-- Cola de pendientes y fallidos por reintentar.
CREATE INDEX "ix_entrega_correo_estado" ON "entrega_correo"("estado");
