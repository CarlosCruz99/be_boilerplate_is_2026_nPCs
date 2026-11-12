-- DB-7.1: vista de solo lectura con la tabla de posiciones de la temporada actual y el lugar de
-- cada equipo. Orden de H7: puntos, diferencia de goles, goles a favor y nombre.
-- La vista no se declara en schema.prisma: el backend (BE-7.1) la consulta con $queryRaw.
CREATE VIEW "v_tabla_posiciones" AS
SELECT
  p."temporada_id",
  p."equipo_id",
  e."nombre",
  p."pj", p."pg", p."pe", p."pp", p."gf", p."gc", p."dg", p."puntos",
  ROW_NUMBER() OVER (
    PARTITION BY p."temporada_id"
    ORDER BY p."puntos" DESC, p."dg" DESC, p."gf" DESC, e."nombre" ASC, e."id" ASC
  )::INTEGER AS "lugar"
FROM "posicion" p
JOIN "equipo" e ON e."id" = p."equipo_id"
JOIN "temporada" t ON t."id" = p."temporada_id"
WHERE t."actual" = TRUE;

COMMENT ON VIEW "v_tabla_posiciones" IS 'Tabla de posiciones de la temporada actual (H7). Solo lectura; la alimenta posicion (BE-8.1).';
