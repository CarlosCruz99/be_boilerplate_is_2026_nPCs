# DB-1.4 · Seed consolidado

Se carga con `npm run db:seed` (después de DB-1.2 y DB-3.2). **No crea equipos ni jugadores** y **no siembra posiciones**
(las calcula BE-8.1). No depende del día en que se corre: todas las fechas son fijas.

## Apertura 2026 (partidos ordenados por id; jornadas 1 a 4 ya Publicadas por DB-3.2)
| Qué | Cantidad |
|---|---|
| Jornadas 1 a 3: partidos Finalizados (marcador, faltas, inicio_real, fin_real, participantes y estadísticas) | 18 |
| Primer partido de la jornada 4: En curso (1-0, sin fin_real) | 1 |
| Resto: Programados | 47 |
- 7 participantes por equipo y partido; una fila de estadística por participante (goles, asistencias, tarjetas).
- Los goles de los jugadores de cada lado suman exactamente el marcador del partido.
- El partido 12 conserva la fila de DB-9.1 (primer jugador local: 1 gol, 0 asistencias, 1 tarjeta).

## Clausura 2025
1 jornada (Publicada) y 2 partidos Finalizados (2-1 y 0-0), con arbitro1/arbitro2 y Cancha 1/2.

## Cuotas y pagos (Apertura 2026; equipos 1 a 6 = los primeros 6 Inscritos por id)
| Equipo | Cuotas | Pagos | Resultado en la vista H21 |
|---|---|---|---|
| 1 Tigres | Inscripción 100.00, Arbitraje 25.50 | Verificados 100.00 y 25.50 | Pagado, sin saldo |
| 2 Leones | Inscripción 100.00 (vence 2027-12-31) | Verificado 40.00 | Saldo 60.00, no vencido |
| 3 Águilas | Inscripción 100.00 (vence 2026-10-31) | Verificado 30.00 + Pendiente 50.00 | Saldo 70.00, vencido desde 2026-10-31 |
| 4 Pumas | — | — | Sin cuotas |
| 5 Halcones | Inscripción 100.00, Arbitraje 25.50 | Verificado 100.00; Pendiente 25.50; Rechazado 10.00 (motivo de 20+ caracteres) | Totales H14: registrado 135.50, verificado 100.00, pendiente 25.50, rechazado 10.00 |
| 6 Lobos | Inscripción 100.00 | Verificado 77.00 + Pendiente 15.00 | Saldo 23.00 (aislado del 5) |

- Solo el dinero **Verificado** reduce el saldo. Pendiente + Verificado nunca supera el monto de la cuota (trigger).
- Bandeja de pendientes (H24), del más antiguo al más nuevo: equipo 3 (50.00), 5 (25.50), 6 (15.00).
- Los comprobantes son claves de prueba (`seed/pagos/...png`): **no existen archivos físicos** en el almacenamiento.
- Cuotas de arbitraje del equipo 1 y 5: ligadas al primer partido Finalizado de cada equipo.

## Idempotencia
Dos corridas dejan los mismos registros y las siguientes conservan lo que se haya hecho desde la aplicación:
cada partido se actualiza **junto con** sus participantes y estadísticas en una sola transacción, y solo si sigue Programado
(un partido ya finalizado o corregido no recibe datos de prueba); las cuotas se buscan antes de crearse; los pagos se insertan
solo si su comprobante no existe (el trigger de tope corre antes del conflicto, por eso `skipDuplicates` no basta para pagos).
Los seeds de H1 y del calendario tampoco pisan en la segunda corrida el estado de los equipos ni los horarios de los partidos.

## Efecto en los scripts de prueba
Los scripts SQL que suponían la base vacía ahora se llevan a línea base vacía **dentro de su transacción** (se revierte con
el ROLLBACK) o comparan contra el estado previo. Se entregan actualizados junto con este seed.
`db-h1-seed.sql` sigue dependiendo de la fecha del día (fallo conocido, ajeno a DB-1.4).
