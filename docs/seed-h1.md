## Datos de prueba de H1 (DB-1.2)

Se cargan con `npm run db:seed` (o `docker compose exec api npx prisma db seed`). Es idempotente: se puede correr varias veces y deja los mismos registros.

**Contraseña de todas las cuentas de H1:** `Liga2026!` (el usuario demo del boilerplate sigue con `Demo1234!`).

### Cuentas

| Rol | Correo | Nota |
|---|---|---|
| Organizador | `organizador@liga.test` | 1 cuenta |
| Árbitro | `arbitro1@liga.test` … `arbitro4@liga.test` | 4 cuentas |
| Jugador con ficha ligada | `jugador01@liga.test` … `jugador12@liga.test` | una por cada equipo Inscrito de Apertura 2026 (jugador.usuario_id) |
| Capitán | `capitan.<equipo>.<temporada>@liga.test` | una cuenta por equipo, rol JUGADOR; ver tabla de equipos |

### Temporadas y equipos

**Apertura 2026** · 2026-11-07 a 2027-01-16 · actual = true · inscripción cerrada · max_equipos = 12

| Equipo | Estado | Jugadores | Capitán |
|---|---|---|---|
| Tigres FC | INSCRITO | 7 | `capitan.tigres-fc.ap26@liga.test` |
| Leones FC | INSCRITO | 15 | `capitan.leones-fc.ap26@liga.test` |
| Águilas FC | INSCRITO | 9 | `capitan.aguilas-fc.ap26@liga.test` |
| Pumas FC | INSCRITO | 10 | `capitan.pumas-fc.ap26@liga.test` |
| Halcones FC | INSCRITO | 11 | `capitan.halcones-fc.ap26@liga.test` |
| Lobos FC | INSCRITO | 12 | `capitan.lobos-fc.ap26@liga.test` |
| Osos FC | INSCRITO | 13 | `capitan.osos-fc.ap26@liga.test` |
| Toros FC | INSCRITO | 14 | `capitan.toros-fc.ap26@liga.test` |
| Cobras FC | INSCRITO | 8 | `capitan.cobras-fc.ap26@liga.test` |
| Jaguares FC | INSCRITO | 10 | `capitan.jaguares-fc.ap26@liga.test` |
| Pirañas FC | INSCRITO | 12 | `capitan.piranas-fc.ap26@liga.test` |
| Rayos FC | INSCRITO | 9 | `capitan.rayos-fc.ap26@liga.test` |
| Panteras FC | PENDIENTE | 9 | `capitan.panteras-fc.ap26@liga.test` |

**Clausura 2027** · 2027-03-01 a 2027-06-30 · actual = false · inscripción abierta · max_equipos = 12

| Equipo | Estado | Jugadores | Capitán |
|---|---|---|---|
| Dragones FC | INSCRITO | 8 | `capitan.dragones-fc.cl27@liga.test` |
| Búhos FC | INSCRITO | 9 | `capitan.buhos-fc.cl27@liga.test` |
| Zorros FC | INSCRITO | 10 | `capitan.zorros-fc.cl27@liga.test` |
| Delfines FC | INSCRITO | 11 | `capitan.delfines-fc.cl27@liga.test` |
| Tiburones FC | INSCRITO | 8 | `capitan.tiburones-fc.cl27@liga.test` |
| Gavilanes FC | INSCRITO | 9 | `capitan.gavilanes-fc.cl27@liga.test` |
| Venados FC | INSCRITO | 12 | `capitan.venados-fc.cl27@liga.test` |
| Coyotes FC | INSCRITO | 10 | `capitan.coyotes-fc.cl27@liga.test` |
| Cóndores FC | INSCRITO | 8 | `capitan.condores-fc.cl27@liga.test` |
| Mapaches FC | INSCRITO | 9 | `capitan.mapaches-fc.cl27@liga.test` |
| Alacranes FC | PENDIENTE | 9 | `capitan.alacranes-fc.cl27@liga.test` |
| Colibríes FC | PENDIENTE | 5 | `capitan.colibries-fc.cl27@liga.test` |
| Tucanes FC | PENDIENTE | 8 | `capitan.tucanes-fc.cl27@liga.test` |
| Iguanas FC | RECHAZADO | 8 | `capitan.iguanas-fc.cl27@liga.test` |

**Clausura 2025** · 2025-03-01 a 2025-06-30 · actual = false · inscripción cerrada · max_equipos = 12

| Equipo | Estado | Jugadores | Capitán |
|---|---|---|---|
| Tigres FC | INSCRITO | 8 | `capitan.tigres-fc.cl25@liga.test` |
| Leones FC | INSCRITO | 8 | `capitan.leones-fc.cl25@liga.test` |
| Águilas FC | INSCRITO | 8 | `capitan.aguilas-fc.cl25@liga.test` |
| Pumas FC | INSCRITO | 8 | `capitan.pumas-fc.cl25@liga.test` |

### Casos especiales

- **Cumple 16 años hoy:** SEED-0131 (Panteras FC, Apertura 2026). La fecha se recalcula en cada corrida.
- **Pendiente con 5 jugadores:** Colibríes FC (Clausura 2027). **Pendiente con un jugador de 15 años:** Tucanes FC (Clausura 2027). **Rechazado con motivo:** Iguanas FC (Clausura 2027).
- **Temporada completa:** Apertura 2026 ya tiene 12 Inscritos; Panteras FC queda Pendiente para probar "La temporada está completa.".
- **Aislamiento por temporada:** Tigres FC, Leones FC, Águilas FC y Pumas FC existen en Apertura 2026 y en Clausura 2025.
- **Probar la vinculación de ficha (BE-1.4):** crea una cuenta nueva y vincula una ficha libre, por ejemplo la identificación SEED-0100 con su fecha de nacimiento (consúltala en la base).
- Las fotos apuntan a `/uploads/seed/jugador-ejemplo.png`; coloca una imagen de ejemplo en esa ruta si el frontend las muestra.

Las canchas, el calendario y los pagos de prueba los cargan DB-3.2 y DB-1.4.

El modelo User del boilerplate se mapea a la tabla usuario con @@map("usuario"); los campos usan @map (password_hash, is_active…). Se renombró la tabla y sus nombres de llave con una migración manual para no perder datos y para que Prisma no detecte desviación.