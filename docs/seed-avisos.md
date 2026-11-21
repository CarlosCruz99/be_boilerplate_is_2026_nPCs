## Avisos de prueba (DB-20.1)

Carga 47 avisos para usuarios existentes: los capitanes de los 3 primeros equipos (por id) de **Apertura 2026**. Requiere el seed de H1.

```bash
npm run db:seed        # idempotente
```

| Usuario | Avisos | Leídos | Sin leer |
|---|---|---|---|
| A (capitán del equipo 1) | 45 | 20 (los más antiguos) | 25 |
| B (capitán del equipo 2) | 2 | 1 | 1 |
| C (capitán del equipo 3) | 0 | – | – |

Los avisos recorren los 6 tipos con su módulo y su tipo de referencia, llevan `claveIdempotencia` fija (`seed-aviso-A-001`, ...) y se crean con `upsert` por (usuario, clave) y `update: {}`: una segunda corrida no duplica ni reinicia los que ya se marcaron como leídos.

### Verificación

```bash
docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h20-restricciones.sql
docker exec -i si_be_postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < test/db/db-h20-seed.sql
```
