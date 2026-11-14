-- DB-14.1: índice para buscar las cuotas de un equipo en una temporada (historial de pagos de H14 y reporte de H21).
-- cuota solo tenía índices únicos parciales (uno por concepto), que no sirven para "todas las cuotas del equipo".
-- Los pagos ya se alcanzan por ix_pago_cuota_estado (DB-13.1).
CREATE INDEX "ix_cuota_equipo_temporada" ON "cuota"("equipo_id", "temporada_id");
