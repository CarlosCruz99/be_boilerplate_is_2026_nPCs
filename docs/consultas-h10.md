# H10 · Consultas de estadísticas personales (DB-10.1)

Migración: `20261112140000_db_10_1_indice_estadistica_jugador` (depende de DB-9.1, DB-1.1 y DB-3.1)

Una sola fuente: `estadistica_partido`. Un resultado es oficial cuando el partido está `FINALIZADO` (no hay bandera `es_oficial`). Las consultas no escriben ni crean tablas.

## Índices evaluados

| Tabla | Índices existentes | Decisión |
|---|---|---|
| estadistica_partido | único `(partido_id, jugador_id)` | **Se agrega** `ix_estadistica_jugador (jugador_id)`: la consulta busca por jugador y el único empieza por `partido_id`, que no sirve para eso |
| equipo_jugador | único `(temporada_id, jugador_id)`, `(equipo_id)` | Nada: ya cubre la búsqueda por temporada y jugador |
| partido | `(temporada_id, jornada_id)`, local/visitante + inicio, y `ix_partido_estado_inicio` (DB-6.1) | Nada: se llega a `partido` por su llave primaria desde `estadistica_partido` |

## Consultas (`$1` = jugador, `$2` = temporada; el jugador sale de la sesión, nunca del cliente)

Acumulados (siempre una fila; sin registros devuelve ceros):

```sql
SELECT COALESCE(SUM(e.goles), 0)::int       AS goles,
       COALESCE(SUM(e.asistencias), 0)::int AS asistencias,
       COALESCE(SUM(e.tarjetas), 0)::int    AS tarjetas
FROM estadistica_partido e
JOIN partido p ON p.id = e.partido_id
JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
WHERE e.jugador_id = $1 AND p.temporada_id = $2 AND p.estado = 'FINALIZADO';
```

Detalle (un renglón por partido; sin registros, lista vacía):

```sql
SELECT p.id AS partido_id, p.inicio AS fecha, rival.id AS rival_id, rival.nombre AS rival,
       e.goles, e.asistencias, e.tarjetas
FROM estadistica_partido e
JOIN partido p ON p.id = e.partido_id
JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
JOIN equipo rival ON rival.id = CASE WHEN ej.equipo_id = p.equipo_local_id
                                     THEN p.equipo_visitante_id ELSE p.equipo_local_id END
WHERE e.jugador_id = $1 AND p.temporada_id = $2 AND p.estado = 'FINALIZADO'
ORDER BY p.inicio DESC, p.id DESC;
```

Ambas usan el mismo `FROM` y `WHERE`, así que los acumulados son siempre la suma del detalle. Quedan excluidos: otras temporadas, partidos no Finalizados y otros jugadores.

## EXPLAIN

En una copia temporal escalada (~20 mil registros, todos los jugadores por todos los partidos):

```
Aggregate (actual rows=1 loops=1)
  ->  Index Scan using ix_escala_jugador on est_escala (actual rows=66 loops=1)
        Index Cond: (jugador_id = 1)
```

Entra por el índice de jugador y lee solo los 66 registros de ese jugador, sin recorrer la tabla.

## Reversión

`down.sql` elimina `ix_estadistica_jugador`. Las consultas no tienen nada que revertir.
