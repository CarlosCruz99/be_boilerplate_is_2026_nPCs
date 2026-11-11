# Diagrama ER · H5 (marcador, bitácora y participantes)

```mermaid
erDiagram
  PARTIDO ||--o{ BITACORA_MARCADOR : "partido_id"
  USUARIO ||--o{ BITACORA_MARCADOR : "usuario_id (uuid)"
  PARTIDO ||--o{ PARTICIPACION_PARTIDO : "partido_id"
  EQUIPO_JUGADOR ||--o{ PARTICIPACION_PARTIDO : "(equipo_id, jugador_id)"

  PARTIDO { int id PK
    int goles_local "0 a 99, default 0"
    int goles_visitante "0 a 99, default 0"
    int faltas_local "0 a 99, default 0"
    int faltas_visitante "0 a 99, default 0"
    timestamptz inicio_real "nulo hasta que inicia"
    timestamptz fin_real "nulo hasta que finaliza" }
  BITACORA_MARCADOR { int id PK
    int partido_id FK
    uuid usuario_id FK
    int goles_local
    int goles_visitante
    int faltas_local
    int faltas_visitante
    varchar_10 accion "INICIAR | ACTUALIZAR | FINALIZAR"
    timestamptz fecha_registro "default now()" }
  PARTICIPACION_PARTIDO { int partido_id PK_FK
    int jugador_id PK
    int equipo_id "FK compuesta con jugador_id" }
```

`partido` es la fuente oficial del marcador por equipo y de las faltas. Los goles, asistencias y tarjetas **por jugador** viven solo en `estadistica_partido` (DB-9.1).

## Restricciones

| Regla | Mecanismo | Error |
|---|---|---|
| Goles y faltas de 0 a 99 (cuatro columnas) | `CHECK` por columna | 23514 |
| Tiempos reales según el estado | `ck_partido_tiempos`: Programado o Cancelado sin tiempos; En curso con `inicio_real` y sin `fin_real`; Finalizado con ambos y `fin_real >= inicio_real` | 23514 |
| La bitácora solo acepta partidos y usuarios existentes | FK `RESTRICT` | 23503 |
| Acción de la bitácora válida | `CHECK (accion IN ('INICIAR','ACTUALIZAR','FINALIZAR'))` | 23514 |
| Un jugador aparece una sola vez por partido | PK `(partido_id, jugador_id)` | 23505 |
| El participante pertenece al equipo indicado | FK compuesta `(equipo_id, jugador_id)` a `equipo_jugador` | 23503 |
| El equipo indicado juega ese partido | trigger `tr_participacion_equipo_del_partido` | 23514 |
| No se borran partidos ni usuarios con bitácora o participantes | FK `RESTRICT` | 23503 |

## Decisiones que van más allá del texto de la tarea

- **Trigger de equipo del partido.** La FK a `equipo_jugador` solo prueba que el jugador es de ese equipo; no impide registrar a un jugador de un equipo que no juega el partido. El trigger lo cierra. Si se prefiere dejarlo al backend, basta quitarlo (está en su propio bloque, y `down.sql` lo borra).
- **`ck_bitacora_valores`.** Una fila de bitácora es una foto del marcador, así que usa el mismo rango 0 a 99 que `partido`.
- **Backfill.** Si al migrar ya hubiera partidos En curso o Finalizados sin tiempos reales, se les asigna el horario programado, para que `ck_partido_tiempos` no falle.

Los datos de prueba (estados, marcadores y participantes de los partidos) los carga DB-1.4.
