# DB-4.1 · Índices del calendario por equipo (H4) y por jornada (H3)

Migración: `prisma/migrations/20261108100000_db_4_1_indices_calendario` (con `down.sql`).

| Índice | Columnas | Lo usa |
|---|---|---|
| `ix_partido_local_inicio` | `equipo_local_id, inicio` | partidos de un equipo como local, ya ordenados por fecha (H4) |
| `ix_partido_visitante_inicio` | `equipo_visitante_id, inicio` | partidos de un equipo como visitante (H4) |
| `ix_partido_temporada_jornada` | `temporada_id, jornada_id` | listado de una jornada (H3) |

> El documento de tareas escribe `(temporada_id, jornada)`. En nuestro modelo la columna es `jornada_id`
> (llave a `jornada`), por eso el índice se crea sobre `jornada_id`.

Las restricciones de exclusión de DB-3.1 (`ex_partido_cancha`, `ex_partido_arbitro`) ya indexan cancha y
árbitro por horario, y `uq_partido_cruce_temporada` empieza por temporada. Ninguno sirve para buscar por equipo.

## Consulta de referencia (H4)

```sql
SELECT * FROM partido
 WHERE (equipo_local_id = :equipo OR equipo_visitante_id = :equipo)
   AND estado <> 'CANCELADO'
 ORDER BY inicio;
```

## Resultado de EXPLAIN

Se obtiene con `test/db/db-h4-explain.sql` (requiere el seed de DB-3.2). Lo que PostgreSQL muestra depende del
tamaño de la tabla, por eso hay tres pruebas:

1. **Los 66 partidos tal cual.** PostgreSQL elige `Seq Scan` (0.02 ms). Con 66 filas, que caben en una
   página de 8 kB, leer la tabla entera cuesta menos que usar un índice. Es el comportamiento correcto
   y no es un defecto de los índices. Además, `ex_partido_arbitro` es un índice parcial con la misma
   condición `estado <> 'CANCELADO'` y el optimizador lo prefiere si se le prohíbe el recorrido completo.
2. **Copia de los 66 partidos con solo los índices de DB-4.1**, sin recorrido completo. Resultado:
   `Bitmap Heap Scan` sobre un `BitmapOr` de `ix_partido_local_inicio` (6 filas) e
   `ix_partido_visitante_inicio` (5 filas) = 11 partidos, 0.04 ms.
3. **Copia temporal de 100 000 partidos sin tocar el optimizador.** Elige por sí mismo el mismo plan
   (`BitmapOr` de los dos índices, sin `Seq Scan`) y tarda 0.6 ms. Así el calendario sigue por debajo
   de 1 s cuando crezcan los datos.

```
Sort
  -> Bitmap Heap Scan on partido
       Recheck Cond: ((equipo_local_id = 7) OR (equipo_visitante_id = 7))
       Filter: (estado <> 'CANCELADO')
       -> BitmapOr
            -> Bitmap Index Scan on <indice local>      (equipo_local_id = 7)
            -> Bitmap Index Scan on <indice visitante>  (equipo_visitante_id = 7)
Execution Time: 0.610 ms
```

El criterio "menos de 50 ms con los 66 partidos" se cumple en todos los casos (0.02 a 0.04 ms).

## Cómo reproducirlo

```bash
docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h4-explain.sql
```

Termina con "Indices de DB-4.1 verificados." y no deja datos: las copias son temporales.

## Revertir

`down.sql` borra los tres índices y no toca datos.
