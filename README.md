# Integrantes del equipo

- Carlos Humberto Cruz Parada - 00013324 (Backend)
- Diego Benjamin Hurtado Ramos - 00034124 (Frontend)
- Jose Martin Luna Ramos – 00308324 (Frontend)
- Francisco Javier Martinez Donado - 00073424 (QA)
- Cristofer Enoc Melara Aldana - 00102224 (Documentación/Backend)
- Edson Enrique Palacios Quinteros – 00376920 (Base de datos)

## SI Backend Boilerplate

API REST construida con **NestJS 12**, **Prisma 7** y **PostgreSQL 18**, con autenticación por usuario y contraseña lista para usar.

---

## Tabla de contenidos

- [Stack técnico](#stack-técnico)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Cómo levantar el proyecto](#cómo-levantar-el-proyecto)
  - [Opción A: todo con Docker](#opción-a-todo-con-docker)
  - [Opción B: Postgres en Docker + API en el host](#opción-b-postgres-en-docker--api-en-el-host-recomendado-para-desarrollar)
- [Docker en detalle](#docker-en-detalle)
- [Prisma en detalle](#prisma-en-detalle)
- [Autenticación](#autenticación)
- [Endpoints](#endpoints)
- [Arquitectura por capas](#arquitectura-por-capas)
- [Path aliases](#path-aliases)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Scripts disponibles](#scripts-disponibles)

---

## Stack técnico

| Tecnología | Versión | Para qué se usa |
|---|---|---|
| [NestJS](https://nestjs.com) | 12 | Framework HTTP. Módulos, inyección de dependencias, guards y pipes |
| [TypeScript](https://www.typescriptlang.org) | 6 | Tipado estático. El proyecto es **ESM puro** (`"type": "module"`) |
| [Prisma ORM](https://www.prisma.io) | 7 | ORM y motor de migraciones versionadas |
| [PostgreSQL](https://www.postgresql.org) | 18 | Base de datos relacional |
| [@nestjs/jwt](https://github.com/nestjs/jwt) | 12 | Firma y verificación de los JWT de acceso |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | 6 | Hasheo de contraseñas (cost 12 por defecto) |
| [class-validator](https://github.com/typestack/class-validator) | 0.15 | Validación declarativa de los DTO de entrada |
| [Swagger](https://docs.nestjs.com/openapi/introduction) | 12 | Documentación OpenAPI en `/api/docs` |
| [tsc-alias](https://github.com/justkey007/tsc-alias) | 1 | Reescribe los path aliases del JS compilado (ver [Path aliases](#path-aliases)) |
| [Vitest](https://vitest.dev) | 4 | Tests unitarios y e2e |
| [oxlint](https://oxc.rs) | 1 | Linter (con chequeos type-aware) |

### Dos detalles del stack que conviene saber

**El proyecto es ESM puro.** `package.json` declara `"type": "module"` y el `tsconfig.json` usa `moduleResolution: nodenext`. En la práctica: **todo import relativo lleva la extensión `.js`**, incluso apuntando a un archivo `.ts`.

```ts
import { AuthService } from './auth.service.js'; // ✅
import { AuthService } from './auth.service';    // ❌ falla en runtime
```

**Prisma 7 no lee la conexión desde `schema.prisma`.** A diferencia de versiones anteriores, la connection string se entrega en tiempo de ejecución mediante un *driver adapter* (`@prisma/adapter-pg`). Eso ocurre en [prisma.service.ts](src/prisma/prisma.service.ts). El CLI, por su lado, la toma de [prisma.config.ts](prisma.config.ts).

---

## Requisitos previos

- **Node.js ≥ 20.19** (recomendado 22 o 24). Prisma 7 requiere `^20.19 || ^22.12 || >=24`
- **Docker** y **Docker Compose v2+**
- **npm**, **yarn** o **pnpm**

---

## Variables de entorno

Copiá la plantilla y ajustá lo que necesites:

```bash
cp .env.example .env
```

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | `development` | Entorno de ejecución |
| `PORT` | `3000` | Puerto HTTP de la API |
| `POSTGRES_USER` | `postgres` | Usuario que crea el contenedor de Postgres |
| `POSTGRES_PASSWORD` | `postgres` | Contraseña de ese usuario |
| `POSTGRES_DB` | `si_be_boilerplate` | Base que se crea al inicializar |
| `POSTGRES_PORT` | `5432` | Puerto publicado en el host |
| `DATABASE_URL` | — | **Obligatoria.** Connection string de Prisma |
| `JWT_SECRET` | — | **Obligatoria.** Mínimo 32 caracteres |
| `JWT_EXPIRES_IN` | `15m` | Vigencia del access token |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | `7` | Vigencia del refresh token |
| `BCRYPT_SALT_ROUNDS` | `12` | Cost factor de bcrypt |

> La app **valida el entorno al arrancar** ([env.validation.ts](src/config/env.validation.ts)). Si falta `DATABASE_URL` o `JWT_SECRET`, o si el secreto es más corto que 32 caracteres, falla de inmediato con un mensaje claro en lugar de romperse más tarde.

Generá un secreto real con:

```bash
openssl rand -base64 32
```

> **Ojo con el host de la base.** Si corrés la API en tu máquina, `DATABASE_URL` apunta a `localhost`. Si la corrés dentro de Compose, el host es el nombre del servicio (`postgres`); eso ya lo resuelve `docker-compose.yml` sobreescribiendo la variable.

---

## Cómo levantar el proyecto

### Opción A: todo con Docker

Levanta Postgres y la API juntos. La API aplica las migraciones pendientes al arrancar.

```bash
cp .env.example .env
docker compose up --build
```

Listo: la API queda en `http://localhost:3000/api/v1` y la documentación en `http://localhost:3000/api/docs`.

Para cargar el usuario de prueba:

```bash
docker compose exec api npx prisma db seed
```

### Opción B: Postgres en Docker + API en el host (recomendado para desarrollar)

Te da hot reload y stack traces directos, usando el mismo Postgres del contenedor.

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Solo la base
docker compose up -d postgres

# 3. Dependencias (el postinstall genera el cliente de Prisma)
npm install          # o: yarn install  /  pnpm install

# 4. Aplicar migraciones y cargar el usuario demo
npm run prisma:migrate
npm run db:seed

# 5. Arrancar en watch mode
npm run start:dev
```

<details>
<summary>Equivalencias con yarn y pnpm</summary>

| npm | yarn | pnpm |
|---|---|---|
| `npm install` | `yarn install` | `pnpm install` |
| `npm run start:dev` | `yarn start:dev` | `pnpm start:dev` |
| `npm run prisma:migrate` | `yarn prisma:migrate` | `pnpm prisma:migrate` |
| `npm run db:seed` | `yarn db:seed` | `pnpm db:seed` |

</details>

Verificá que responde:

```bash
curl http://localhost:3000/api/v1
# Hello World!
```

---

## Docker en detalle

Hay dos piezas, con responsabilidades distintas:

### `docker-compose.yml` — orquesta el entorno

Define dos servicios:

**`postgres`** levanta el motor de base de datos para desarrollo local, usando la imagen oficial `postgres:18-alpine`. Tiene tres detalles importantes:

- **Volumen nombrado `pgdata`**, así los datos sobreviven a `docker compose down`.
- **Montado en `/var/lib/postgresql`**, *no* en `/var/lib/postgresql/data`. Postgres 18 cambió el layout y guarda los datos en un subdirectorio con el número de major version; usar la ruta vieja hace que el contenedor entre en un loop de reinicios.
- **`healthcheck` con `pg_isready`**, para que el servicio `api` no arranque hasta que la base acepte conexiones. Sin esto las migraciones fallan de forma intermitente al levantar todo junto.

**`api`** construye y corre la aplicación a partir del `Dockerfile`, espera el healthcheck de `postgres` (`condition: service_healthy`) y al arrancar ejecuta `prisma migrate deploy && node dist/main.js`.

### `Dockerfile` — construye la imagen de la API

Es multi-stage, en tres etapas:

1. **`deps`** — instala dependencias. Copia `prisma/` y `prisma.config.ts` **antes** de `npm ci`, porque el `postinstall` corre `prisma generate` y necesita el schema. Usa un `DATABASE_URL` placeholder: `generate` lee la variable aunque no se conecte a la base.
2. **`builder`** — compila TypeScript a `dist/` y elimina las devDependencies.
3. **`runner`** — imagen final sobre `node:24-alpine`, corriendo como el usuario sin privilegios `node`.

> **Por qué `prisma` y `dotenv` son `dependencies` y no `devDependencies`:** el contenedor ejecuta `prisma migrate deploy` al arrancar, y el `npm prune --omit=dev` del build se las llevaría. Es la diferencia entre la imagen arrancando y quedándose en un loop de reinicios.

> El schema usa `engineType = "client"`, que no descarga el motor nativo de Rust. Por eso Alpine funciona sin tener que instalar `libssl`.

### Comandos útiles

```bash
docker compose up -d postgres        # solo la base
docker compose up --build            # todo, reconstruyendo la imagen
docker compose ps                    # estado y healthchecks
docker compose logs -f api           # logs de la API
docker compose down                  # parar (los datos se conservan)
docker compose down -v               # parar y borrar la base y las fotos locales

# Abrir una consola psql dentro del contenedor
docker compose exec postgres psql -U postgres -d si_be_boilerplate
```

**Resetear la base y las fotos locales desde cero:**

```bash
docker compose down -v && docker compose up -d postgres
npm run prisma:migrate && npm run db:seed
```

---

## Prisma en detalle

El schema vive en [prisma/schema.prisma](prisma/schema.prisma) y define dos modelos: `User` y `RefreshToken`.

La configuración del CLI está en [prisma.config.ts](prisma.config.ts) (rutas del schema y las migraciones, comando de seed, y de dónde sale `DATABASE_URL`).

### El cliente generado no se commitea

El generador `prisma-client` escribe en `src/generated/prisma`, que está en `.gitignore`. Se regenera solo en cada `npm install` gracias al script `postinstall`. Si tocás el schema:

```bash
npm run prisma:generate
```

> El `output` tiene que caer dentro de `src/` porque `tsconfig.build.json` compila únicamente ese directorio.

### Flujo de trabajo con migraciones

```bash
# Crear y aplicar una migración nueva (desarrollo)
npm run prisma:migrate -- --name agrega_campo_x

# Aplicar migraciones pendientes sin generar ninguna (producción / CI)
npm run prisma:deploy

# Explorar los datos en una UI web
npm run prisma:studio

# Borrar la base, re-aplicar todas las migraciones y correr el seed
npm run db:reset
```

### Seed

[prisma/seed.ts](prisma/seed.ts) crea un usuario de prueba mediante `upsert`, así que se puede correr las veces que haga falta:

[Seed del calendario (H3): 66 partidos de prueba y consultas de verificación](docs/seed-calendario.md)

| Email | Contraseña |
|---|---|
| `demo@example.com` | `Demo1234!` |

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



---

## Autenticación

Esquema **access token + refresh token**, solo con email y contraseña.

- **Access token** — JWT firmado con HS256, vida corta (15 min). Viaja en `Authorization: Bearer <token>`. Es stateless: no se consulta la base para validar la firma.
- **Refresh token** — string opaco de 32 bytes aleatorios, con vida larga (7 días). Sirve únicamente para pedir un access token nuevo.

### Decisiones de seguridad

**Las contraseñas se hashean con bcrypt** (cost 12, configurable). Nunca se guardan ni se devuelven en claro: los controladores responden un DTO explícito ([user-response.dto.ts](src/users/dto/user-response.dto.ts)) en vez de la fila de Prisma, para que `passwordHash` no pueda filtrarse por descuido.

**Los refresh tokens se guardan hasheados con SHA-256**, no con bcrypt. Es deliberado: son 32 bytes aleatorios, o sea alta entropía, así que no hay un espacio de búsqueda que justifique un KDF lento; además hace falta buscarlos por hash en un índice (bcrypt usa un salt distinto por hash, así que no se puede indexar). bcrypt queda para las contraseñas, que sí son de baja entropía. Si se filtra la base, los refresh tokens emitidos no son utilizables.

**El email se normaliza a minúsculas y sin espacios.** El índice único de Postgres es sensible a mayúsculas, así que sin normalizar `Demo@mail.com` y `demo@mail.com` serían dos cuentas distintas y el login fallaría según cómo el usuario escribiera su email. Se normaliza en dos lugares a propósito: el decorador [`@IsNormalizedEmail()`](src/common/decorators/is-normalized-email.decorator.ts) cubre lo que entra por HTTP —y tiene que correr **antes** de `@IsEmail`, o un email con espacios se rechaza con un 400 antes de poder limpiarlo—, y `UserRepository` normaliza de nuevo al leer y escribir, para cubrir a cualquier llamador interno que no pase por un DTO.

**Rotación con detección de reúso.** Cada `POST /auth/refresh` revoca el token usado y emite uno nuevo. Si llega un refresh token que ya fue canjeado, se asume robo y se revocan **todas** las sesiones del usuario.

**Login que no filtra información.** Email no registrado, contraseña incorrecta y cuenta inactiva devuelven exactamente el mismo `401` con el mismo mensaje. Cuando el email no existe igual se ejecuta un `bcrypt.compare` contra un hash descartable, para que la diferencia de tiempo de respuesta no permita enumerar qué emails tienen cuenta.

**Todo cerrado por defecto.** `JwtAuthGuard` está registrado como guard global; las rutas públicas se abren explícitamente con `@Public()`. Olvidarse del decorador deja el endpoint protegido, que es el error seguro.

**El usuario se relee en cada request**, así una cuenta desactivada o borrada deja de funcionar al instante, sin esperar a que expire el token.

### Buenas prácticas REST aplicadas

- **Versionado en la URI:** todo cuelga de `/api/v1`.
- **Sustantivos en plural para los recursos:** crear un usuario es `POST /users`, no `POST /createUser`.
- **Códigos de estado correctos:** `201` al crear, `200` en login, `204` en logout (sin cuerpo), `400` de validación, `401` de autenticación, `409` de conflicto.
- **Validación estricta de la entrada:** `whitelist` descarta propiedades no declaradas y `forbidNonWhitelisted` rechaza la request si vienen de más, en vez de ignorarlas en silencio.
- **Errores con forma consistente:** `{ message, error, statusCode }`.

---

## Endpoints

Base: `http://localhost:3000/api/v1` · Documentación interactiva: `http://localhost:3000/api/docs`

| Método | Ruta | Auth | Código | Descripción |
|---|---|---|---|---|
| `GET` | `/` | — | `200` | Health check |
| `POST` | `/users` | — | `201` | Registra una cuenta JUGADOR e inicia sesión |
| `POST` | `/auth/login` | — | `200` | Inicia sesión con email y contraseña |
| `POST` | `/auth/refresh` | — | `200` | Renueva el par de tokens |
| `POST` | `/auth/logout` | — | `204` | Cierra la sesión |
| `GET` | `/auth/me` | Bearer | `200` | Usuario autenticado, rol, equipo actual y capitanía |
| `GET` | `/temporadas` | Bearer | `200` | Lista temporadas. Filtro opcional `inscripcionAbierta=true\|false` |
| `POST` | `/equipos` | JUGADOR | `201` | Inscribe un equipo pendiente en una temporada abierta |
| `GET` | `/equipos/mi-equipo?temporadaId=2` | Capitán | `200` | Consulta estado, motivo de rechazo y contador |
| `POST` | `/equipos/{equipoId}/jugadores` | Capitán | `201` | Agrega una ficha con foto JPG o PNG en multipart |
| `GET` | `/equipos/{equipoId}/jugadores` | Capitán | `200` | Lista la plantilla del equipo |
| `DELETE` | `/equipos/{equipoId}/jugadores/{jugadorId}` | Capitán | `204` | Quita una ficha de un equipo pendiente |
| `POST` | `/jugadores/vincular` | JUGADOR | `200` | Vincula una ficha por identificación y fecha de nacimiento |

La foto de una ficha nueva se guarda bajo `UPLOADS_DIR` (por defecto `uploads`). En Docker Compose el volumen `uploads` conserva los archivos. Para leer `fotoUrl` se envía el Bearer de la cuenta vinculada o de un capitán de la ficha. La ruta de descarga comienza en `/uploads/jugadores/`.

Para ejecutar `npm run test:e2e`, apunta `DATABASE_URL` a una base de pruebas descartable, configura `JWT_SECRET` y ejecuta `npm run prisma:deploy` y `npm run db:seed`. Las pruebas crean cuentas, equipos y fichas de prueba.

### Ejemplos

```bash
BASE=http://localhost:3000/api/v1
```

**Registro**

```bash
curl -i -X POST $BASE/users \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Néstor Pérez","email":"nestor@example.com","password":"unaclave1","fechaNacimiento":"2004-05-12"}'
```

```jsonc
// 201 Created
{
  "id": "29bda5e8-e0c8-4ec2-bc7f-94c41c3c0140",
  "email": "nestor@example.com",
  "nombre": "Néstor Pérez",
  "rol": "JUGADOR"
}
```

La contraseña exige al menos 8 caracteres, una letra y un número, con un máximo de 72 bytes por bcrypt. El correo duplicado devuelve `409`. El registro abre sesión y entrega el mismo par de tokens que el login en los encabezados `X-Access-Token` y `X-Refresh-Token`. La vigencia en segundos está en `X-Token-Expires-In`.

**Login**

```bash
curl -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Demo1234!"}'
```

```jsonc
// 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "dbfcf084b4a238cf9afaaa2f800ee216...",
  "expiresIn": 900,
  "user": { "id": "...", "email": "demo@example.com", "isActive": true, "createdAt": "..." }
}
```

**Ruta protegida**

```bash
curl $BASE/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

`equipoActualId` y `capitaneaEquipoId` se calculan para la temporada marcada como actual. Si no hay una relación en esa temporada, el campo correspondiente vale `null`.

Al vincular una ficha, la respuesta usa su inscripción de la temporada actual si existe, o la más reciente por fecha de inicio. Si la ficha no está en ninguna plantilla, `equipoId` y `temporadaId` valen `null`.

**Renovar tokens**

```bash
curl -X POST $BASE/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

Devuelve un par nuevo y revoca el anterior. Reusar un refresh token ya canjeado responde `401` y cierra todas las sesiones del usuario.

**Logout**

```bash
curl -X POST $BASE/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

Responde `204 No Content`. Es idempotente: repetirlo con un token ya revocado también devuelve `204`, para no convertirse en un oráculo que revele qué tokens existen.

---

## Arquitectura por capas

Cada módulo se organiza en carpetas por responsabilidad, y **cada carpeta expone un barrel `index.ts`**. El flujo de una request es siempre el mismo:

```
HTTP  →  controllers/  →  services/  →  repositories/  →  Prisma  →  PostgreSQL
            (HTTP)         (negocio)      (acceso a datos)
```

| Capa | Responsabilidad | No debe |
|---|---|---|
| `controllers/` | Traducir HTTP a llamadas de servicio: rutas, códigos de estado, Swagger | Contener lógica de negocio ni tocar Prisma |
| `services/` | Lógica de negocio y reglas del dominio | Conocer Prisma ni sus códigos de error |
| `repositories/` | **Todo** el acceso a datos. Es el único lugar que inyecta `PrismaService` | Lanzar excepciones HTTP |
| `dto/` | Forma y validación de lo que entra y sale | — |
| `errors/` | Errores de dominio que cruzan de repositorio a servicio | — |

### Por qué los repositorios

Antes los servicios inyectaban `PrismaService` directamente. Moverlo a repositorios da tres cosas concretas:

1. **Un solo lugar por tabla.** Toda query sobre `users` vive en [user.repository.ts](src/users/repositories/user.repository.ts); toda query sobre `refresh_tokens`, en [refresh-token.repository.ts](src/auth/repositories/refresh-token.repository.ts). Buscar "dónde se actualiza esto" deja de ser un grep por todo el proyecto.
2. **Servicios testeables sin base de datos.** Como `UsersService` depende de `UserRepository` y no de Prisma, un test unitario le pasa un doble y listo.
3. **Métodos reutilizables.** Los repositorios se exportan desde su módulo, así que otro módulo puede reutilizar el acceso a datos sin pasar por la lógica del servicio.

### Errores de dominio en lugar de códigos del ORM

El repositorio traduce el código `P2002` de Prisma (violación de unicidad) a un `EmailAlreadyTakenError`, y el servicio lo convierte en un `409 Conflict`:

```ts
// repositories/user.repository.ts — sabe de Prisma, no sabe de HTTP
if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
  throw new EmailAlreadyTakenError(email);
}

// services/users.service.ts — sabe de HTTP, no sabe de Prisma
if (error instanceof EmailAlreadyTakenError) {
  throw new ConflictException('El email ya está registrado.');
}
```

Así ninguna capa filtra sus detalles hacia la otra: si mañana se cambia de ORM, solo se toca el repositorio.

---

## Path aliases

Cada módulo tiene un alias `@NombreModulo`, y como cada carpeta tiene su barrel, el import apunta directo a la capa:

```ts
import { AuthService, TokenService } from '@Auth/services';
import { UserRepository }            from '@Users/repositories';
import { CreateUserDto }             from '@Users/dto';
import { Public, CurrentUser }       from '@Auth/decorators';
import { IsNormalizedEmail }        from '@Common/decorators';
import type { EnvConfig }            from '@Config';
import type { User }                 from '@PrismaClient';
```

Definidos en [tsconfig.json](tsconfig.json):

| Alias | Resuelve a |
|---|---|
| `@Auth`, `@Auth/*` | `src/auth/index.ts`, `src/auth/*/index.ts` |
| `@Users`, `@Users/*` | `src/users/…` |
| `@Health`, `@Health/*` | `src/health/…` |
| `@Prisma`, `@Prisma/*` | `src/prisma/…` |
| `@Common/*` | `src/common/*/index.ts` |
| `@Config` | `src/config/index.ts` |
| `@PrismaClient` | Cliente generado de Prisma |

### Dos detalles que hacen que esto funcione

**El comodín termina en `/index.ts`**, no en `/*`:

```jsonc
"@Auth/*": ["./src/auth/*/index.ts"]   // ✅
"@Auth/*": ["./src/auth/*"]            // ❌ TS2307
```

Con `moduleResolution: nodenext` TypeScript **no** resuelve un directorio a su `index`, así que la segunda forma no encuentra el módulo. Apuntar explícitamente al barrel lo resuelve, y además deja una sola entrada por módulo en el tsconfig.

**El build reescribe los alias con `tsc-alias`.** `tsc` emite `from '@Auth/services'` tal cual, y Node ESM falla con `ERR_INVALID_MODULE_SPECIFIER` porque no es un nombre de paquete válido. Por eso el build es:

```
nest build && tsc-alias -p tsconfig.build.json
```

`tsc-alias` reescribe el JS emitido a rutas relativas reales (`./auth/services/index.js`). En watch mode el `start:dev` corre ambos procesos con `concurrently`. Vitest resuelve los alias por su cuenta con `vite-tsconfig-paths`, así que los tests no necesitan el paso extra.

> Si agregás un módulo nuevo, sumá su par de entradas al `paths` del tsconfig. Si agregás una carpeta dentro de un módulo existente, con crear su `index.ts` alcanza: el comodín ya la cubre.

---

## Estructura del proyecto

```
.
├── docker-compose.yml            # Postgres + API para desarrollo local
├── Dockerfile                    # Imagen multi-stage de la API
├── prisma.config.ts              # Configuración del CLI de Prisma
├── prisma/
│   ├── schema.prisma             # Modelos User y RefreshToken
│   ├── migrations/               # Migraciones versionadas
│   └── seed.ts                   # Usuario demo
└── src/
    ├── main.ts                   # Bootstrap: prefijo, validación, Swagger
    ├── app.module.ts             # Módulo raíz y guard global
    ├── common/
    │   └── decorators/           # IsNormalizedEmail (validación compartida)
    ├── config/
    │   ├── env.validation.ts     # Validación de variables de entorno
    │   └── index.ts
    ├── prisma/
    │   ├── services/             # PrismaService (cliente + driver adapter)
    │   ├── prisma.module.ts      # Módulo global
    │   └── index.ts
    ├── health/
    │   ├── controllers/          # GET /
    │   ├── services/
    │   ├── health.module.ts
    │   └── index.ts
    ├── users/
    │   ├── controllers/          # POST /users
    │   ├── services/             # Lógica de negocio, hasheo bcrypt
    │   ├── repositories/         # UserRepository: acceso a la tabla users
    │   ├── errors/               # EmailAlreadyTakenError
    │   ├── dto/
    │   ├── users.module.ts
    │   └── index.ts
    ├── auth/
    │   ├── controllers/          # login, refresh, logout, me
    │   ├── services/             # AuthService y TokenService
    │   ├── repositories/         # RefreshTokenRepository
    │   ├── guards/               # JwtAuthGuard
    │   ├── decorators/           # @Public() y @CurrentUser()
    │   ├── types/                # AccessTokenPayload, TokenPair
    │   ├── dto/
    │   ├── auth.module.ts
    │   └── index.ts
    └── generated/prisma/         # Cliente de Prisma (ignorado en git)
```

Cada carpeta de capa incluye un `index.ts` que reexporta sus elementos, de modo que el resto del proyecto importe del barrel y nunca de un archivo suelto.

---

## Scripts disponibles

| Script | Descripción |
|---|---|
| `start` | Compila y arranca la API |
| `start:dev` | Arranca en modo watch (compilador + reescritura de alias) |
| `start:prod` | Arranca desde `dist/` ya compilado |
| `build` | Compila a `dist/` y reescribe los path aliases |
| `lint` | Corre oxlint con chequeos type-aware |
| `format` | Formatea con Prettier |
| `test` | Tests unitarios |
| `test:e2e` | Tests end-to-end |
| `test:cov` | Tests con reporte de cobertura |
| `prisma:generate` | Regenera el cliente de Prisma |
| `prisma:migrate` | Crea y aplica una migración (desarrollo) |
| `prisma:deploy` | Aplica migraciones pendientes (producción) |
| `prisma:studio` | Abre Prisma Studio |
| `db:seed` | Carga el usuario demo |
| `db:reset` | Resetea la base y vuelve a migrar |
