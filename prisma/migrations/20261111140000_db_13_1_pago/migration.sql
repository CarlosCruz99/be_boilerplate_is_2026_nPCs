-- DB-13.1: pagos de cuotas (H13) y consulta de saldos. Depende de cuota (DB-12.1).
-- El binario del comprobante NO se guarda aquí: va a almacenamiento privado; esta tabla solo
-- conserva sus metadatos (clave generada, tipo y tamaño). La revisión de H24 se agrega en DB-24.1.
CREATE TYPE "estado_pago" AS ENUM ('PENDIENTE', 'VERIFICADO', 'RECHAZADO');

CREATE TABLE "pago" (
  "id" SERIAL NOT NULL,
  "cuota_id" INTEGER NOT NULL,
  "monto" NUMERIC(12,2) NOT NULL,
  "fecha_pago" DATE NOT NULL,
  "comprobante_clave" VARCHAR(255) NOT NULL,
  "comprobante_mime" VARCHAR(100) NOT NULL,
  "comprobante_bytes" INTEGER NOT NULL,
  "estado" "estado_pago" NOT NULL DEFAULT 'PENDIENTE',
  "registrado_por" UUID NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "clave_idempotencia" VARCHAR(100),
  CONSTRAINT "pago_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pago_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pago_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_pago_monto" CHECK ("monto" > 0),
  -- Formatos y tamaño que acepta H13: PDF, JPEG o PNG, de 1 byte a 5 MiB.
  CONSTRAINT "ck_pago_comprobante_mime" CHECK ("comprobante_mime" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "ck_pago_comprobante_bytes" CHECK ("comprobante_bytes" BETWEEN 1 AND 5242880)
);
-- Cada archivo guardado pertenece a un solo pago (borrar un huérfano no puede afectar a otro).
CREATE UNIQUE INDEX "pago_comprobante_clave_key" ON "pago"("comprobante_clave");
-- Idempotencia por usuario: el mismo usuario no repite una clave (los NULL no chocan entre sí).
CREATE UNIQUE INDEX "pago_registrado_por_clave_idempotencia_key" ON "pago"("registrado_por", "clave_idempotencia");
-- Sumas por cuota y estado (saldos, disponible, H14, H21).
CREATE INDEX "ix_pago_cuota_estado" ON "pago"("cuota_id", "estado");

-- Un pago PENDIENTE o VERIFICADO reserva parte de la cuota; uno RECHAZADO no. La suma de ambos no puede
-- superar el monto de la cuota. El trigger bloquea la fila de cuota (como pide el documento), así que dos
-- registros simultáneos se turnan y el segundo ve al primero. BE-13.1 y las transiciones de H24 pueden
-- bloquear la cuota antes: es el mismo bloqueo, dentro de la misma transacción.
-- Si la cuota no existe se deja pasar: la llave foránea responde "no existe" (23503).
CREATE FUNCTION "fn_pago_no_supera_cuota"() RETURNS trigger AS $$
DECLARE
  v_monto NUMERIC(12,2);
  v_otros NUMERIC(12,2);
BEGIN
  IF NEW."estado" <> 'RECHAZADO' THEN
    SELECT "monto" INTO v_monto FROM "cuota" WHERE "id" = NEW."cuota_id" FOR UPDATE;
    IF FOUND THEN
      SELECT COALESCE(SUM("monto"), 0) INTO v_otros FROM "pago"
       WHERE "cuota_id" = NEW."cuota_id" AND "estado" <> 'RECHAZADO' AND "id" IS DISTINCT FROM NEW."id";
      IF v_otros + NEW."monto" > v_monto THEN
        RAISE EXCEPTION 'El pago de % supera el disponible de la cuota % (monto %, reservado %)', NEW."monto", NEW."cuota_id", v_monto, v_otros
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "tr_pago_no_supera_cuota"
  BEFORE INSERT OR UPDATE OF "monto", "estado", "cuota_id" ON "pago"
  FOR EACH ROW EXECUTE FUNCTION "fn_pago_no_supera_cuota"();

-- Saldos por cuota, calculados siempre desde los pagos (no se guardan duplicados):
--   total_verificado = suma de VERIFICADO        pendiente_verificacion = suma de PENDIENTE
--   saldo = monto - total_verificado             disponible = monto - total_verificado - pendiente_verificacion
-- RECHAZADO no aporta a ninguno. Sin argumento devuelve todas las cuotas.
CREATE FUNCTION "fn_saldo_cuota"(p_cuota_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  "cuota_id" INTEGER, "monto_total" NUMERIC(12,2), "total_verificado" NUMERIC(12,2),
  "pendiente_verificacion" NUMERIC(12,2), "saldo" NUMERIC(12,2), "disponible" NUMERIC(12,2)
) LANGUAGE sql STABLE AS $$
  SELECT x.id, x.monto, x.v, x.p, x.monto - x.v, x.monto - x.v - x.p
  FROM (
    SELECT c."id", c."monto",
           COALESCE(SUM(p."monto") FILTER (WHERE p."estado" = 'VERIFICADO'), 0) AS v,
           COALESCE(SUM(p."monto") FILTER (WHERE p."estado" = 'PENDIENTE'), 0) AS p
    FROM "cuota" c LEFT JOIN "pago" p ON p."cuota_id" = c."id"
    WHERE p_cuota_id IS NULL OR c."id" = p_cuota_id
    GROUP BY c."id", c."monto"
  ) x
$$;
