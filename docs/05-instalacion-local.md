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

Los scripts especializados se ubican en `prisma/` y se ejecutan en el orden definido por `prisma/seed.ts`.

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

Las pruebas de integración se ejecutan con una base de datos de pruebas aislada y variables de entorno válidas.


## Precisión sobre el `docker-compose.yml` actual

El Compose revisado en el backend contiene **solo** `postgres` y `api`; el frontend se inicia desde su repositorio con `npm run dev`. Por ello, este procedimiento usa Docker Compose para el backend y la base, y un proceso separado para Next.js. El desarrollo local utiliza dos procesos: el Compose existente para API y PostgreSQL, y Next.js ejecutado desde el repositorio frontend.

## Preparación de datos semilla

`npm run db:seed` ejecuta `prisma/seed.ts`, que carga los usuarios y equipos, calendario, avisos, estadísticas, galería y datos consolidados mediante sus funciones de seed. Los registros demostrativos corresponden a Apertura 2026, Clausura 2027 y Clausura 2025.
## Ambiente publicado

- Frontend: [https://project-czgs9.vercel.app/login](https://project-czgs9.vercel.app/login).
- Documentación de la API: [https://be-boilerplate-is-2026-npcs.onrender.com/api/docs](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs).
