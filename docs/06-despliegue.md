# Despliegue

## Estado de los ambientes

| Componente | Plataforma | URL pública | Rama requerida |
|---|---|---|---|
| Frontend | **No verificada** | **Pendiente** | `main` |
| Backend | **No verificada** | **Pendiente** | `main` |
| Base PostgreSQL | **No verificada** | Privada | Migraciones de release |
| Swagger | Backend en `/api/docs` | **Pendiente** | Misma versión que API desplegada |

No se hallaron URLs reales de producción en los insumos revisados; completar únicamente después de verificar HTTPS y acceso externo.

## Publicación según la guía docente

1. Fusionar historias completas en `develop` con PR aprobado, y validar pruebas de integración y aceptación.
2. Crear `release/1.0.0` desde `develop` en **cada** repositorio.
3. Ajustar metadatos de versión, documentación, configuración y pruebas de humo en release.
4. Abrir y aprobar PR a `main`; fusionar la release también de vuelta a `develop`.
5. Etiquetar el commit exacto desplegado como `v1.0.0` y registrar la release en GitHub.
6. Desplegar backend, PostgreSQL y frontend; configurar HTTPS, CORS/URL API, migraciones, almacenamiento persistente y seed, y probar `/api/docs` públicamente.
7. Corregir defectos en producción por `hotfix/<descripcion>` y publicar `v1.0.1` cuando aplique.

## Variables de producción

Definir en la plataforma de despliegue, **sin publicar sus valores**: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`, `NODE_ENV`, `PORT`, `BCRYPT_SALT_ROUNDS`, `UPLOADS_DIR`, `RESEND_API_KEY`, `H15_CORREO_REMITENTE`; frontend `API_URL`. Validar persistencia real para archivos privados y CORS del frontend.

## Verificaciones obligatorias

- Las dos ramas `main` coinciden con los artefactos realmente desplegados; ambas tienen tag `v1.0.0`.
- Swagger visible por HTTPS, con operaciones y autorizaciones correctas.
- Script de datos semilla idempotente y usuario por cada rol; **credenciales solo en Moodle**.
- Las fotografías y comprobantes sobreviven reinicios y son privados según rol.
- Todos los roles pueden probar sus flujos y las historias pendientes se declaran.
- Mantener disponible el sistema al menos hasta el 24-11-2026, según el formato de entrega.