# H11 · Consulta de clasificación de jugadores (DB-11.1)

Sin migración ni cambios de esquema: usa `estadistica_partido`, `partido`, `equipo_jugador` y `jugador` (todas existentes) y el índice de DB-10.1. No agrega persistencia: la clasificación se calcula al consultar, con los datos vigentes (una corrección autorizada se refleja en la siguiente consulta).

## Consulta (`$1` = temporada, `$2` = métrica)

```sql
SELECT x.jugador_id, j.nombre_completo AS nombre, x.total,
       DENSE_RANK() OVER (ORDER BY x.total DESC)::int AS posicion
FROM (
  SELECT e.jugador_id,
         SUM(CASE $2::text WHEN 'goles' THEN e.goles WHEN 'asistencias' THEN e.asistencias END)::int AS total
  FROM estadistica_partido e
  JOIN partido p ON p.id = e.partido_id
  JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
  WHERE p.temporada_id = $1 AND p.estado = 'FINALIZADO' AND $2::text IN ('goles', 'asistencias')
  GROUP BY e.jugador_id
) x
JOIN jugador j ON j.id = x.jugador_id
ORDER BY x.total DESC, x.jugador_id ASC;
```

## Reglas

- **Solo registros oficiales**: partidos `FINALIZADO` de la temporada pedida; otras temporadas y partidos no oficiales no entran.
- **Posiciones densas**: totales 5, 3, 3, 1 dan posiciones 1, 2, 2, 3. El orden de salida usa `jugador_id` solo para que el resultado sea estable; no cambia la posición.
- **Incluye totales en cero**: entra cualquier jugador con al menos un registro oficial en la temporada, aunque su total sea 0.
- **Métrica de lista cerrada**: `goles` o `asistencias`. La métrica viaja como parámetro (nunca se concatena al SQL); un valor fuera de la lista (incluido NULL o un intento de inyección) devuelve **vacío**. El backend debe validarla antes y responder 400, como pide BE-11.1; esta protección es la segunda barrera.
- Sin registros oficiales: lista vacía.

## Índices

No se necesita ninguno nuevo: se llega a los partidos de la temporada por `ix_partido_temporada_jornada` y a sus estadísticas por la unicidad `(partido_id, jugador_id)`.
