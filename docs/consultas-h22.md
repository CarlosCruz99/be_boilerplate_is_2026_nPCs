# H22 · Consulta de indicadores oficiales de la temporada (DB-22.1)

Sin migración ni cambios de esquema: usa `partido` (DB-3.1 con el marcador de DB-5.1) y `estadistica_partido` (DB-9.1). No se crea otra persistencia de resultados.

## Qué es oficial

Un partido es oficial cuando `temporada_id = :temporada AND estado = 'FINALIZADO'`. Finalizar vuelve oficial el resultado, así que **no existe ni se consulta una columna `resultado_oficial`**; el alias lógico `es_oficial` de H10 equivale a esta condición. Una corrección de H23 actualiza `partido` y `estadistica_partido`, y el reporte las lee, así que siempre muestra el dato vigente.

## Consulta (`$1` = temporada)

```sql
WITH oficial AS (
  SELECT id, goles_local, goles_visitante
  FROM partido
  WHERE temporada_id = $1 AND estado = 'FINALIZADO'
)
SELECT (SELECT COUNT(*) FROM oficial)::int                                                         AS total_partidos,
       (SELECT COALESCE(SUM(goles_local + goles_visitante), 0) FROM oficial)::int                  AS total_goles,
       (SELECT COALESCE(SUM(e.tarjetas), 0)    FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int AS total_tarjetas,
       (SELECT COALESCE(SUM(e.asistencias), 0) FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int AS total_asistencias;
```

## Reglas de cálculo

| Indicador | Cálculo | Procedencia |
|---|---|---|
| totalPartidos | `COUNT(*)` del conjunto oficial | partido |
| totalGoles | `SUM(goles_local + goles_visitante)` del conjunto oficial | partido (nunca unido a estadística) |
| totalTarjetas | `SUM(tarjetas)` de las filas de estadística de partidos oficiales | estadistica_partido |
| totalAsistencias | `SUM(asistencias)` de las filas de estadística de partidos oficiales | estadistica_partido |

- **Sin duplicaciones:** los partidos y los goles se calculan sobre `partido` solamente. Agregar filas de estadística (incluso con cero tarjetas) no multiplica partidos ni goles. Un partido Finalizado sin ninguna fila de estadística sigue contando como partido y aportando sus goles.
- **Instantánea consistente:** los cuatro valores salen de **un solo `SELECT`**, que usa una única instantánea; no pueden mezclar estados de antes y después de una finalización o corrección.
- **Sin partidos oficiales o temporada inexistente:** una fila con cuatro ceros (la existencia de la temporada la valida BE-22.1, con 404).
- Quedan excluidos los estados PROGRAMADO, EN_CURSO y CANCELADO (aunque tengan marcador o estadísticas) y los partidos de otras temporadas.

Conjunto de prueba T1: P1 Finalizado 2-1 (3 tarjetas, 2 asistencias) y P2 Finalizado 0-0 (1 tarjeta, 1 asistencia) dan **2 partidos, 3 goles, 4 tarjetas y 3 asistencias**.

## Índices

No hace falta ninguno nuevo: el conjunto oficial se alcanza por `ix_partido_temporada_jornada (temporada_id, jornada_id)` y las estadísticas por la unicidad `(partido_id, jugador_id)`. Verificado con EXPLAIN en una copia escalada (300 temporadas):

```
Index Scan using ix_esc_temporada_jornada on partido_esc (actual rows=18 loops=1)
  Index Cond: (temporada_id = 150)
```
