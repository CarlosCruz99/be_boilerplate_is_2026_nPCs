# H17 · Galería de fotos y videos por partido (DB-17.1)

Migración: `20261111160000_db_17_1_contenido_galeria`

## Estrategia de almacenamiento (decisión: local privado)

- El archivo **no** se guarda en la BD. Vive en un directorio privado del servidor (fuera de `public/`, no servido como estático).
- La BD guarda los metadatos y una clave relativa `storage_key` con una huella de la subida y un UUID aleatorio. El nombre original se guarda como metadato.
- Descarga: endpoint autenticado que hace streaming leyendo `storage_key`.
- Subida: 1) guardar archivo, 2) insertar metadatos. Si el INSERT falla (p. ej. límite de 30), el backend borra el archivo.
- Borrado: primero lógico (`estado = ELIMINADO`, `eliminado_en`, `eliminado_por`); el borrado físico es posterior.
- Las filas del seed **no tienen archivo físico**; el frontend/BE debe tolerar archivo ausente.

## Subida de contenido (BE-17.1)

- `POST /api/v1/partidos/{partidoId}/galeria` requiere el JWT de un organizador.
- Envía entre 1 y 30 archivos como campos repetidos `archivos[]` en `multipart/form-data`. El campo de texto opcional `descripcion` aplica al lote y admite hasta 200 caracteres.
- Se admite JPG/JPEG o PNG de hasta 5 MiB y MP4 de hasta 50 MiB. El servidor valida el tipo a partir del contenido del archivo.
- La respuesta 200 incluye `partidoId`, `totalActivos`, `limite` y `resultados` en el orden enviado. Cada resultado incluye `nombre` y `estado`, con `contenidoId` si quedó `PUBLICADO` o `motivo` si quedó en `ERROR`.
- Una subida con el mismo partido, organizador, nombre, descripción y bytes devuelve el identificador de la publicación activa anterior. Se puede enviar un archivo por solicitud para mostrar su avance y controlar su reintento de manera individual.

## Consulta y archivos privados (BE-18.1)

`GET /api/v1/partidos/{partidoId}/galeria?page=1&pageSize=6` devuelve `items`, `page`, `pageSize`, `totalElementos` y `totalPaginas`. `page` empieza en 1 y `pageSize` es fijo en 6. Ambos parámetros son opcionales. Los elementos activos se ordenan por `creadoEn` e `id` descendentes. Una galería vacía devuelve `200` con `items: []` y totales en cero. Una página posterior a la última conserva los totales de la galería y devuelve `items: []`.

Cada elemento incluye `id`, `tipo`, `descripcion`, `creadoEn`, `mimeType` y `url`. `url` identifica la ruta `/api/v1/partidos/{partidoId}/galeria/{contenidoId}/archivo`. Incluir `Authorization: Bearer <JWT>` tanto en el listado como al abrir el archivo. El archivo se transmite en línea y admite `Range` para reproducción de MP4. Las dos respuestas usan `Cache-Control: private, no-store`.

El organizador y los jugadores o capitanes de los equipos del partido pueden consultar. Cada petición de archivo comprueba de nuevo el partido, la pertenencia del usuario y que el elemento esté activo. `400` indica parámetros inválidos, `401` una sesión inválida, `403` falta de acceso y `404` un partido, elemento o archivo inexistente. Los elementos del seed sin archivo físico aparecen en el listado con sus metadatos y devuelven `404` al abrirlos. Un fallo de la base produce un error de consulta.

Pasaron 485 pruebas unitarias y 18 pruebas de integración en PostgreSQL 18. Las pruebas de consulta y subida cubren el orden, la paginación, los permisos, el borrado lógico y las respuestas `206` y `416` para rangos de MP4.

Contrato de la historia y subtarea. [H18](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-26) · [BE-18.1](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-131)

## ER

```mermaid
erDiagram
  partido ||--o{ contenido_galeria : "tiene"
  user ||--o{ contenido_galeria : "sube"
  user ||--o{ contenido_galeria : "elimina"
  contenido_galeria {
    uuid id PK
    int partido_id FK
    tipo_contenido_galeria tipo
    varchar storage_key UK
    varchar nombre_original
    varchar mime_type
    int tamano_bytes
    varchar descripcion "NULL, max 200"
    uuid subido_por FK
    timestamptz creado_en
    estado_contenido_galeria estado
    timestamptz eliminado_en "NULL"
    uuid eliminado_por FK "NULL"
  }
```

## Diccionario de datos

| Columna | Tipo | Nulo | Regla |
|---|---|---|---|
| id | UUID | no | PK (lo genera Prisma, sin default en BD) |
| partido_id | INT | no | FK partido, ON DELETE RESTRICT |
| tipo | enum FOTO/VIDEO | no | |
| storage_key | VARCHAR(255) | no | UNIQUE |
| nombre_original | VARCHAR | no | no vacío |
| mime_type | VARCHAR | no | FOTO: image/jpeg, image/png · VIDEO: video/mp4 |
| tamano_bytes | INT | no | FOTO 1..5 242 880 (5 MiB) · VIDEO 1..52 428 800 (50 MiB) |
| descripcion | VARCHAR(200) | sí | máx. 200 |
| subido_por | UUID | no | FK usuario, RESTRICT |
| creado_en | TIMESTAMPTZ(3) | no | default now() |
| estado | enum ACTIVO/ELIMINADO | no | default ACTIVO |
| eliminado_en / eliminado_por | TIMESTAMPTZ / UUID | sí | ACTIVO ⇒ ambos NULL; ELIMINADO ⇒ ambos con valor |

## Índices

- `contenido_galeria_storage_key_key` (único).
- `ix_galeria_partido_fecha (partido_id, creado_en DESC, id DESC)`: paginación estable por partido, con `id` como desempate.
- `ix_galeria_activos (partido_id) WHERE estado='ACTIVO'`: parcial, para el conteo del límite y el listado.

## Qué valida la BD y qué no

La BD garantiza: límite de 30 activos por partido (trigger, seguro bajo concurrencia porque bloquea la fila del partido con `FOR NO KEY UPDATE`), coherencia tipo/mime/tamaño, longitud de descripción, consistencia del borrado lógico y unicidad de la clave.

La BD **no** puede validar: que el contenido real del archivo sea del tipo declarado (firma/magic bytes), que el archivo exista en disco, ni que el usuario tenga rol ORGANIZADOR. Eso es responsabilidad del backend.

Los elementos ELIMINADOS no cuentan para el límite: al borrar uno se libera un cupo.

## Añadidos más allá de la especificación (se pueden quitar)

1. Trigger `tr_galeria_limite_activos` para el límite de 30.
2. CHECK de mime y de tamaño por tipo.
3. Columnas de borrado lógico `eliminado_en` / `eliminado_por`.
4. UNIQUE en `storage_key`.

## Seed

`prisma/seed-galeria.ts` (idempotente, upsert por `storage_key`): los 3 primeros partidos de Apertura 2026 por id → 30, 1 y 0 elementos. El partido de 30 tiene 25 fotos y 5 videos, y una descripción de exactamente 200 caracteres. Hay fechas repetidas a propósito para probar el desempate de la paginación.

## Reversión

`down.sql` elimina trigger, función, tabla y enums. Los archivos físicos que existieran quedarían huérfanos en el disco.
