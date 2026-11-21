# Instalación local

## Requisitos

- Node.js 20.19+ (recomendado 22 o 24); npm.
- Docker y Docker Compose v2+.
- Dos repositorios: [backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs) y [frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs).

## Backend con Docker Compose

```bash
git clone https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs.git
cd be_boilerplate_is_2026_nPCs
cp .env.example .env
# Completar DATABASE_URL, JWT_SECRET y configuración propia
# No reutilizar credenciales de ejemplo en producción.
docker compose up --build
# En otra terminal:
docker compose exec api npx prisma db seed
```

La API local usa `http://localhost:3000/api/v1` y Swagger `http://localhost:3000/api/docs`.

### Alternativa para desarrollo

```bash
docker compose up -d postgres
npm ci
npm run prisma:deploy
npm run db:seed
npm run start:dev
```

Los scripts especializados documentados en `develop` son `prisma/seed-calendario.ts`, `seed-consolidado.ts`, `seed-avisos.ts`, `seed-estadisticas.ts`, `seed-galeria.ts`; verificar su invocación efectiva y el orden de ejecución antes de usarlos con datos persistentes.

## Frontend

```bash
git clone https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs.git
cd fe_boilerplate_is_2026_nPCs
cp .env.example .env.local
# Ajustar API_URL al backend realmente usado
npm ci
npm run dev
```

El frontend abre por defecto en `http://localhost:3000`; para ejecutar frontend y API simultáneamente en el host deben usarse puertos diferentes y `API_URL` debe apuntar al puerto real de la API. El Compose actual no incluye servicio de frontend.

## Variables sin credenciales

| Backend | Uso |
|---|---|
| `NODE_ENV`, `PORT` | Ambiente y puerto |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | PostgreSQL local en Compose |
| `DATABASE_URL` | Conexión Prisma |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Sesión |
| `BCRYPT_SALT_ROUNDS` | Hash de contraseñas |
| `UPLOADS_DIR` | Fotografías locales |
| `RESEND_API_KEY`, `H15_CORREO_REMITENTE` | Correo del módulo H15 (opcional/configurable) |
| Frontend: `API_URL` | Dirección base de la API |

## Pruebas

La corrección H5 del [PR #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31) agregó `test/mesa-partido.e2e-spec.ts`. Requiere una base PostgreSQL de pruebas aislada y los usuarios semilla para árbitro, organizador, capitán y jugador; verifica la respuesta de `GET /api/v1/partidos/:partidoId/mesa` en distintos estados, el cambio de árbitro y los códigos de autorización. **No ejecutar esta suite sobre producción**: inserta y elimina datos de prueba.


```bash
# Backend
npm run lint
npm test
npm run test:e2e

# Frontend (en su directorio)
npm run lint
npm test
npm run build
```

Las pruebas requieren variables de entorno y, cuando correspondan, base de pruebas aislada. Este documento no certifica ejecución exitosa de los comandos.


## Precisión sobre el `docker-compose.yml` actual

El Compose revisado en el backend contiene **solo** `postgres` y `api`; el frontend se inicia desde su repositorio con `npm run dev`. Por ello, este procedimiento usa Docker Compose para el backend y la base, y un proceso separado para Next.js. Para exigir un único `docker compose up` que incluya las tres capas, primero habrá que añadir el servicio frontend a un Compose integrado; no se documenta como disponible todavía.

## Preparación de datos semilla

`prisma/seed.ts` y los archivos `prisma/seed-calendario.ts`, `prisma/seed-consolidado.ts`, `prisma/seed-estadisticas.ts`, `prisma/seed-avisos.ts`, `prisma/seed-galeria.ts` aparecen en `develop`. Hay que revisar la configuración de `prisma.config.ts` y el orden de ejecución de los scripts especializados, en lugar de asumir que `npm run db:seed` invoca automáticamente todos. Los datos de prueba se definen en las historias de la liga (Apertura 2026, Clausura 2027 y Clausura 2025).
