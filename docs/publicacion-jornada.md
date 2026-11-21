# DB-16.1 · Publicación de jornadas

Migración: `prisma/migrations/20261108200000_db_16_1_publicacion_jornada` (con `down.sql`).

## Modelo

`jornada` (creada en DB-3.1) agrega dos columnas:

| Columna | Tipo | Significado |
|---|---|---|
| `publicada_en` | `TIMESTAMPTZ(3)`, nula | momento en que se publicó |
| `publicada_por` | `UUID`, nula, FK a `usuario(id)` `ON DELETE RESTRICT` | organizador que la publicó |

`ck_jornada_publicacion` obliga a que ambas coincidan con el estado:

| Estado | `publicada_en` | `publicada_por` |
|---|---|---|
| `BORRADOR` | nula | nula |
| `PUBLICADA` | con valor | con valor |

Con esto, guardar un borrador no puede dejarlo "medio publicado", y una jornada Publicada siempre dice
quién y cuándo. `RESTRICT` impide borrar al usuario que publicó (con `SET NULL` la jornada Publicada
quedaría sin autor y el CHECK la rechazaría).

## Un aviso por capitán y jornada

No se crea otra tabla. La unicidad la da `UNIQUE (usuario_id, clave_idempotencia)` de DB-20.1; BE-16.1
usa una clave como `JORNADA_PUBLICADA:{jornada_id}` por capitán. Republicar una jornada ya publicada
repite la misma clave y la base rechaza el duplicado.

**Pendiente de verificar cuando exista DB-20.1:** el criterio "no se pueden crear dos avisos para la
misma jornada y capitán". Esta migración no depende de esa tabla.

## Jornadas que ya estaban Publicadas (seed de DB-3.2)

Las jornadas 1 a 4 del seed nacían Publicadas sin fecha ni autor y el CHECK las habría rechazado.
La migración las rellena con el primer organizador (por email) y la hora de la migración; si hay
jornadas Publicadas y ningún organizador, falla con un mensaje claro. El seed
(`prisma/seed-calendario.ts`) ahora crea esas jornadas con `publicadaEn` fijo (`PUBLICADA_EN_SEED`,
2026-11-06 18:00 UTC) y `publicadaPorId` del organizador `organizador@liga.test`.

## Reversión

`down.sql` quita el CHECK, la FK y las dos columnas. Se pierde quién y cuándo publicó cada jornada;
el estado, las jornadas y los partidos no se tocan (66 partidos y 11 jornadas antes y después).

## Verificación

```bash
docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h16-publicacion.sql
```

Comprueba que se rechazan Publicada sin fecha o sin autor, Borrador con fecha o con autor, un autor
inexistente y borrar al autor; que publicar con ambos datos funciona; y que no queda ningún dato
(todo corre en una transacción que se revierte).
