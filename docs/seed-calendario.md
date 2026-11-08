## Calendario de prueba (DB-3.2)

Carga 2 canchas, 11 jornadas y los 66 partidos de la temporada **Apertura 2026** con los 12 equipos Inscritos del seed de H1. Requiere haber corrido antes el seed de H1 (DB-1.2).

```bash
npm run db:seed        # carga H1 y luego el calendario (se puede repetir: es idempotente)
```

### Qué genera

- **Canchas:** "Cancha 1" y "Cancha 2" (direcciones ficticias).
- **Método del círculo:** se ordenan los 12 equipos por id, se fija el primero y se rotan los otros 11 en cada ronda. En la ronda `r`, el partido `i` enfrenta a `arreglo[i]` con `arreglo[11 - i]`, y el local se alterna según `(i + r)` par o impar. Cada par de equipos se enfrenta una sola vez.
- **Jornadas:** 11 de 6 partidos. La jornada 1 es el sábado 2026-11-07 y cada una suma 7 días (la 11 cae el 2027-01-16). Las jornadas 1 a 4 nacen **Publicadas** y la 5 a la 11 en **Borrador**. Los partidos nacen **Programados** (DB-1.4 aplica estados y marcadores).
- **Turnos:** 08:00, 09:30 y 11:00 hora de El Salvador (14:00, 15:30 y 17:00 UTC), 2 canchas por turno, 90 minutos cada partido.
- **Árbitros:** con `arbitro1..4@liga.test` ordenados por correo y los partidos por jornada, turno y cancha, el árbitro del partido `k` (desde 0) es `arbitros[k % 4]`.

### Idempotencia

Dos corridas dejan 66 partidos. Las jornadas se buscan por (temporada, número) y los partidos por (temporada, jornada, local, visitante). Si ya existen, solo se reponen cancha, árbitro y horario; **no se toca el estado** de la jornada ni del partido.

### Verificación

```bash
docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h3-seed.sql
```
Termina con "Seed de calendario verificado." Consultas sueltas para revisar a mano:

```sql
-- Partidos por equipo (todos deben tener 11)
SELECT e.nombre, count(*) AS partidos
FROM partido p JOIN equipo e ON e.id IN (p.equipo_local_id, p.equipo_visitante_id)
GROUP BY e.nombre ORDER BY e.nombre;

-- Partidos por jornada (todas deben tener 6) y su estado
SELECT j.numero, j.estado, count(*) AS partidos
FROM partido p JOIN jornada j ON j.id = p.jornada_id
GROUP BY j.numero, j.estado ORDER BY j.numero;

-- Partidos por árbitro (16 o 17)
SELECT u.email, count(*) AS partidos
FROM partido p JOIN usuario u ON u.id = p.arbitro_id
GROUP BY u.email ORDER BY u.email;
```
