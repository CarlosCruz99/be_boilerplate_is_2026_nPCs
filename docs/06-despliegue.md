# Despliegue de nPCs

## Accesos públicos

| Componente | Plataforma | Dirección |
|---|---|---|
| Frontend web | Vercel | [Aplicación nPCs](https://project-czgs9.vercel.app/login) |
| API REST NestJS | Render | [`https://be-boilerplate-is-2026-npcs.onrender.com/api/v1`](https://be-boilerplate-is-2026-npcs.onrender.com/api/v1) |
| Documentación API | Swagger UI sobre Render | [Swagger](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs) |
| Base de datos | PostgreSQL | Conexión privada, configurada por `DATABASE_URL` |

El frontend utiliza Next.js y se comunica por HTTPS con el backend. NestJS ejecuta la lógica de negocio y utiliza Prisma para acceder a PostgreSQL. El servidor publica la documentación interactiva de la API en `/api/docs`.

## Publicación de la versión 1.0.0

La rama `main` del backend incluye la integración de release mediante [PR #33](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/33) (commit [`ec123e3`](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/commit/ec123e33697d5521b4ea82eba4cf3a6f1f7380db)). La rama `develop` se utiliza para integración y los cambios de release se revisan por Pull Request.

El procedimiento de publicación se basa en Git Flow: implementar en ramas de funcionalidad, integrar a `develop`, estabilizar la versión en `release/1.0.0` y fusionar la release aprobada hacia `main`. Las correcciones sobre una publicación se realizan mediante `hotfix/<descripcion>` y se reintegran a las ramas correspondientes.

## Configuración del backend

Las variables de entorno se configuran en el servicio, sin colocar sus valores en Git:

| Variable | Uso |
|---|---|
| `NODE_ENV`, `PORT` | Modo y puerto del servidor |
| `DATABASE_URL` | Conexión de Prisma con PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y duración de tokens de acceso |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Caducidad de sesiones renovables |
| `BCRYPT_SALT_ROUNDS` | Coste de hash de contraseñas |
| `UPLOADS_DIR` | Directorio usado para archivos en la implementación local |
| `RESEND_API_KEY`, `H15_CORREO_REMITENTE` | Entrega de correo de avisos H15, cuando se configura el par de variables |

En el frontend, `API_URL` identifica el origen del backend. Su valor de producción corresponde a `https://be-boilerplate-is-2026-npcs.onrender.com`.

## Base de datos y datos de demostración

El backend incorpora migraciones versionadas en `prisma/migrations/` y scripts de carga en `prisma/seed.ts`. En entornos desplegados, `prisma migrate deploy` aplica las migraciones existentes sin recrear el esquema. El seed incluye cuentas por rol y ejemplos de temporadas, equipos, partidos, avisos, cuotas y pagos. Las credenciales de prueba se entregan por Moodle y no forman parte de esta documentación pública.

## Archivos multimedia

Los servicios de la API guardan referencias a fotografías, comprobantes y contenido de galería y aplican controles de acceso en las descargas privadas. En el proyecto original, `UPLOADS_DIR` permite definir el directorio de archivos; los volúmenes del `docker-compose.yml` cubren la persistencia del entorno local. En un servicio de contenedores sin disco persistente, la duración de archivos locales queda sujeta a la política del proveedor.

## Recursos de consulta

- [Interfaz web](https://project-czgs9.vercel.app/login)
- [Swagger de producción](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs)
- [Repositorio backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs)
- [Repositorio frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs)
