-- DB-21.1: vista de solo lectura con total, pagado, saldo y vencimiento de las cuotas de cada equipo inscrito,
-- por concepto. El saldo es monto menos pagos VERIFICADO (igual que fn_saldo_cuota de DB-13.1): los pagos
-- PENDIENTE y RECHAZADO no cuentan como pagado. "Hoy" se calcula en America/El_Salvador.
-- La vista no se declara en schema.prisma: el backend (BE-21.1) la consulta con $queryRaw.
CREATE VIEW "v_estado_pagos_equipo" AS
WITH saldo_cuota AS (
  SELECT c."id" AS cuota_id, c."temporada_id", c."equipo_id", c."concepto", c."monto", c."fecha_vencimiento",
         COALESCE(SUM(p."monto") FILTER (WHERE p."estado" = 'VERIFICADO'), 0) AS verificado
  FROM "cuota" c
  LEFT JOIN "pago" p ON p."cuota_id" = c."id"
  GROUP BY c."id"
)
SELECT e."temporada_id", e."id" AS equipo_id, e."nombre", s."concepto",
       COALESCE(SUM(s."monto"), 0) AS total_cuotas,
       COALESCE(SUM(s.verificado), 0) AS pagado,
       COALESCE(SUM(s."monto" - s.verificado), 0) AS saldo_pendiente,
       MIN(s."fecha_vencimiento") FILTER (
         WHERE s."monto" - s.verificado > 0
           AND s."fecha_vencimiento" < (now() AT TIME ZONE 'America/El_Salvador')::date
       ) AS vencido_desde
FROM "equipo" e
LEFT JOIN saldo_cuota s ON s.equipo_id = e."id" AND s."temporada_id" = e."temporada_id"
WHERE e."estado" = 'INSCRITO'
GROUP BY e."temporada_id", e."id", e."nombre", s."concepto";

COMMENT ON VIEW "v_estado_pagos_equipo" IS 'Total, pagado, saldo y vencimiento de cuotas por equipo inscrito y concepto (H21). Solo lectura.';
