# Diagrama ER · H1 (inscripción) y DB-2.1

```mermaid
erDiagram
  USUARIO ||--o{ EQUIPO : "capitan_id"
  USUARIO |o--o{ EQUIPO : "validado_por"
  USUARIO |o--o| JUGADOR : "usuario_id (UNIQUE)"
  TEMPORADA ||--o{ EQUIPO : "temporada_id"
  EQUIPO ||--o{ EQUIPO_JUGADOR : "(equipo_id, temporada_id)"
  JUGADOR ||--o{ EQUIPO_JUGADOR : "jugador_id"

  USUARIO { uuid id PK
    string email UK
    string password_hash
    boolean is_active
    rol_usuario rol "JUGADOR | ARBITRO | ORGANIZADOR"
    string nombre "3 a 120"
    date fecha_nacimiento "no futura" }
  TEMPORADA { int id PK
    string nombre UK
    date fecha_inicio
    date fecha_fin
    smallint max_equipos "default 12"
    boolean inscripcion_abierta
    boolean actual "solo una TRUE" }
  EQUIPO { int id PK
    string nombre "UK (temporada, lower(nombre))"
    int temporada_id FK
    uuid capitan_id FK "UK (temporada, capitan)"
    estado_equipo estado
    timestamptz creado_en
    text motivo_rechazo
    uuid validado_por FK
    timestamptz fecha_validacion }
  JUGADOR { int id PK
    string nombre_completo
    date fecha_nacimiento
    string identificacion UK
    string foto_url
    uuid usuario_id FK "UK, nullable" }
  EQUIPO_JUGADOR { int equipo_id PK
    int jugador_id PK
    int temporada_id "UK (temporada, jugador)" }
```

Reglas clave:
- `UNIQUE (temporada_id, jugador_id)`: un jugador, un equipo por temporada.
- FK compuesta `(equipo_id, temporada_id)`: la temporada del vínculo es la del equipo.
- Capitán = `equipo.capitan_id` (no es un rol almacenado).
