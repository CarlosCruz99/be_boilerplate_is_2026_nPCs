# Diagrama ER · H3 (cancha, jornada y partido)

```mermaid
erDiagram
  TEMPORADA ||--o{ JORNADA : "temporada_id"
  TEMPORADA ||--o{ EQUIPO : "temporada_id"
  JORNADA ||--o{ PARTIDO : "(jornada_id, temporada_id)"
  EQUIPO ||--o{ PARTIDO : "local (equipo_local_id, temporada_id)"
  EQUIPO ||--o{ PARTIDO : "visitante (equipo_visitante_id, temporada_id)"
  CANCHA ||--o{ PARTIDO : "cancha_id"
  USUARIO ||--o{ PARTIDO : "arbitro_id (uuid)"

  CANCHA { int id PK
    string nombre "UK lower(nombre)"
    string direccion
    boolean activa }
  JORNADA { int id PK
    int temporada_id FK
    smallint numero "UK (temporada, numero)"
    estado_jornada estado "BORRADOR | PUBLICADA" }
  PARTIDO { int id PK
    int temporada_id
    int jornada_id FK
    int equipo_local_id FK
    int equipo_visitante_id FK
    int cancha_id FK
    uuid arbitro_id FK "NOT NULL"
    timestamptz inicio
    timestamptz fin "= inicio + 90 min"
    estado_partido estado "PROGRAMADO | EN_CURSO | FINALIZADO | CANCELADO" }
```

Restricciones del partido (todas en la base de datos):

| Regla | Mecanismo |
|---|---|
| Una cancha no tiene dos partidos traslapados | `EXCLUDE USING gist (cancha_id WITH =, tstzrange(inicio, fin) WITH &&) WHERE (estado <> 'CANCELADO')` |
| Un árbitro no tiene dos partidos traslapados | Igual, sobre `arbitro_id` |
| Un cruce A–B ocurre una sola vez por temporada (solo ida) | Índice único parcial sobre `(temporada_id, LEAST(local, visitante), GREATEST(local, visitante))` |
| Duración de 90 minutos; equipos distintos | `CHECK` |
| Equipos y jornada pertenecen a la temporada del partido | Llaves foráneas compuestas |
| Un Cancelado libera cancha, árbitro y cruce | Las restricciones excluyen `estado = 'CANCELADO'` |
| Dos partidos consecutivos (09:30 y 09:30) son válidos | `tstzrange` es semiabierto `[inicio, fin)` |

Se validan en el backend, no en la base: que `arbitro_id` tenga rol Árbitro, que ambos equipos estén Inscritos y "un partido por semana por equipo".

## Decisión (regla 2.2): por qué las restricciones de choque viven en la base de datos

Con dos organizadores agendando a la vez, una validación solo en el backend tiene una ventana de carrera: ambos consultan, ambos ven la cancha libre y ambos insertan. Solo la base de datos puede decidir de forma atómica cuál de los dos gana, así que ningún error o simultaneidad del backend puede generar un calendario inválido. El backend traduce los códigos de PostgreSQL (`23P01` exclusión, `23505` único) a respuestas 409. Alternativa descartada: validar solo en backend. Prisma no expresa las exclusiones ni los índices con expresión; por eso la migración se escribe a mano en SQL y se verifica con `prisma migrate dev` que no haya desviación.
