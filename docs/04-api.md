# API — contrato documentado a partir de `develop`

> **Alcance y fuente:** inventario de decoradores `@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Public`, `@Roles`, `@ApiBearerAuth` y `@ApiTags` de los controladores del backend en `develop`, actualizado al commit `fbd2af922f64b6a127190972b8e8cb3f78e2e554` (merge del [PR #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31), 20 de noviembre, hora de El Salvador). Es un inventario de rutas **en código**, no una certificación de que Swagger desplegado sea idéntico ni de que cada ruta funcione en producción.

## Swagger y convenciones

- **Swagger local:** `http://localhost:3000/api/docs` (`SwaggerModule.setup('api/docs', ...)` en `src/create-app.ts`).
- **Swagger producción:** `https://<URL-REAL-DEL-BACKEND>/api/docs` (**pendiente de confirmar**).
- **API base:** `/api/v1` por `app.setGlobalPrefix('api/v1')`.
- **Excepción al prefijo:** `GET /uploads/jugadores/:archivo` se excluye explícitamente de `/api/v1`.
- **Autenticación:** JWT Bearer (`Authorization: Bearer <access_token>`); los tokens se obtienen en login y se renuevan mediante refresh.
- **Permisos:** el servidor usa `@Roles('JUGADOR')`, `@Roles('ARBITRO')`, `@Roles('ORGANIZADOR')` y validaciones de pertenencia; *Capitán* se determina por `equipo.capitan_id`, no es un rol independiente.
- **Validación:** `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform`; campos adicionales pueden responder `400 Campo no permitido.`.
- **Operaciones públicas explícitas:** registro, login/refresh/logout, listado de partidos, marcador público, posiciones y health. El endpoint de detalle de posición hereda `@Public` de su controlador.
- **Atención:** algunos controladores utilizan `@ApiBearerAuth` sin `@Roles` de clase; la autorización puede ocurrir en guards/servicios. No inferir que esas rutas sean públicas.

## Endpoints por módulo

Cada ruta de esta tabla, salvo la excepción de descargas señalada, usa el prefijo `/api/v1`. Los identificadores con `:id` representan parámetros de URL. La columna «Restricción» muestra la protección declarada o, donde corresponde, una validación adicional que debe comprobarse en ejecución.

### 1. Autenticación y usuarios (H1)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| POST | `/auth/login` | Iniciar sesión | Pública |
| POST | `/auth/refresh` | Renovar sesión | Pública; refresh token |
| POST | `/auth/logout` | Revocar refresh token | Pública; refresh token |
| GET | `/auth/me` | Consultar identidad y pertenencia | Sesión |
| POST | `/users` | Registrar cuenta de jugador | Pública |

### 2. Inscripción y validación (H1, H2)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/temporadas` | Consultar temporadas | Sesión |
| POST | `/equipos` | Inscribir equipo | JUGADOR, queda capitán |
| GET | `/equipos/mi-equipo` | Consultar equipo propio | JUGADOR/capitanía |
| GET | `/equipos` | Listar equipos para validación | ORGANIZADOR |
| GET | `/equipos/:id` | Detalle del equipo y plantilla | ORGANIZADOR |
| PATCH | `/equipos/:id/validacion` | Aprobar o rechazar equipo | ORGANIZADOR |
| POST | `/equipos/:equipoId/jugadores` | Registrar ficha de jugador | JUGADOR/capitán |
| GET | `/equipos/:equipoId/jugadores` | Ver plantilla de equipo | JUGADOR/capitán |
| DELETE | `/equipos/:equipoId/jugadores/:jugadorId` | Quitar ficha | JUGADOR/capitán |
| POST | `/jugadores/vincular` | Vincular ficha a cuenta | JUGADOR |
| GET | `/uploads/jugadores/:archivo` | Descargar foto | Sesión, autorización de recurso; **sin** `/api/v1` |

### 3. Calendario y árbitros (H3, H4, H16, H25)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/canchas` | Consultar canchas | Sesión |
| GET | `/arbitros` | Consultar árbitros disponibles | ORGANIZADOR |
| POST | `/temporadas/:id/calendario/generar` | Generar calendario de temporada | ORGANIZADOR |
| GET | `/temporadas/:id/calendario` | Vista de calendario del organizador | ORGANIZADOR |
| POST | `/partidos` | Programar partido | ORGANIZADOR |
| PATCH | `/partidos/:id` | Modificar partido | ORGANIZADOR |
| GET | `/equipos/:equipoId/partidos` | Calendario de equipo | JUGADOR u ORGANIZADOR; pertenencia |
| GET | `/partidos/:id` | Detalle de partido privado | JUGADOR, ORGANIZADOR o ARBITRO |
| GET | `/partidos/:id/arbitros-disponibles` | Candidatos disponibles | ORGANIZADOR |
| PUT | `/partidos/:id/arbitro` | Asignar o sustituir árbitro | ORGANIZADOR |
| POST | `/jornadas/:id/publicar` | Publicar jornada | ORGANIZADOR |

### 4. Marcadores y resultados (H5, H6, H23)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/partidos` | Listar partidos y filtrar | Pública |
| GET | `/partidos/:partidoId/marcador` | Consultar marcador detallado | Pública |
| GET | `/partidos/:partidoId/mesa` | Consultar estado operativo de la mesa del árbitro: equipos, marcador, faltas, tiempos reales y participantes (H5) | **Solo árbitro asignado**, JWT obligatorio |
| POST | `/partidos/:partidoId/iniciar` | Iniciar partido | Árbitro asignado |
| PATCH | `/partidos/:partidoId/marcador` | Actualizar marcador y faltas | Árbitro asignado |
| PUT | `/partidos/:partidoId/participantes` | Registrar participantes | Árbitro asignado |
| POST | `/partidos/:partidoId/finalizar` | Finalizar partido | Árbitro asignado |
| GET | `/partidos/:partidoId/correccion-oficial` | Consultar información para corrección | ORGANIZADOR |
| PATCH | `/partidos/:partidoId/correccion-oficial` | Corregir resultado oficial | ORGANIZADOR; motivo auditado |

#### Contrato de la mesa del árbitro (H5, PR backend #31)

- **Ruta:** `GET /api/v1/partidos/:partidoId/mesa` (nuevo controlador `MesaPartidoController`, registrado en `CalendarioModule`). El parámetro `partidoId` debe ser un entero positivo válido (máximo `2147483647`).
- **Autenticación/autorización:** token Bearer requerido y guard `@ArbitroAsignado()`. Un usuario sin sesión recibe `401`; un árbitro distinto, jugador, capitán u organizador sin asignación recibe `403`. Un ID inexistente recibe `404`; un ID inválido recibe `400`.
- **Respuesta `200`:** objeto `{ partidoId, estado, local: { id, nombre }, visitante: { id, nombre }, golesLocal, golesVisitante, faltasLocal, faltasVisitante, inicioReal, finReal, participantes: { partidoId, local: [{ id, nombre }], visitante: [{ id, nombre }] } }`. Las cuatro cifras del marcador y las faltas son enteros entre 0 y 99; `inicioReal` y `finReal` son fechas ISO 8601 o `null`.
- **Estados permitidos en consulta:** `PROGRAMADO`, `EN_CURSO`, `FINALIZADO` y `CANCELADO`. Esta consulta **no modifica** el partido y no reemplaza el GET público `/partidos/:partidoId/marcador`.
- **Privacidad y consistencia:** las respuestas envían `Cache-Control: private, no-store` y `Vary: Authorization`; el servicio consulta con transacción `RepeatableRead`. Si cambia la asignación de árbitro, el anterior pierde acceso y el nuevo lo obtiene.
- **Fuente:** `src/calendario/controllers/mesa-partido.controller.ts`, `src/calendario/dto/mesa-partido.dto.ts`, `src/calendario/services/mesa-partido.service.ts`, `test/mesa-partido.e2e-spec.ts` y [PR #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31). El controlador incluye explícitamente anotaciones Swagger para `200`, `400`, `401`, `403` y `404`; la versión desplegada de OpenAPI aún debe verificarse.

### 5. Tabla de posiciones (H7, H8)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/posiciones` | Ranking por temporada | Pública |
| GET | `/posiciones/equipos/:equipoId` | Posición de equipo | Pública por decoración del controlador |
| GET | `/equipos/:equipoId/proximos-partidos` | Próximos rivales | JUGADOR con capitanía |

### 6. Estadísticas de jugadores (H9, H10, H11)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/partidos/:partidoId/estadisticas` | Estadísticas de partido | Sesión/autorización del recurso |
| PUT | `/partidos/:partidoId/estadisticas/:jugadorId` | Registrar/actualizar estadísticas | Árbitro asignado |
| GET | `/temporadas/:temporadaId/mis-estadisticas` | Estadísticas del jugador autenticado | JUGADOR |
| GET | `/temporadas/:temporadaId/jugadores-destacados` | Clasificación de jugadores | ORGANIZADOR |

### 7. Cuotas y pagos (H12, H13, H14, H24)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| POST | `/cuotas` | Crear cuota | ORGANIZADOR |
| GET | `/equipos/:equipoId/cuotas` | Consultar cuotas y saldos | JUGADOR/capitán |
| POST | `/cuotas/:cuotaId/pagos` | Registrar pago y comprobante | JUGADOR/capitán |
| GET | `/equipos/:equipoId/pagos` | Consultar historial | JUGADOR/capitán |
| GET | `/pagos/:pagoId/comprobante` | Descargar comprobante propio | JUGADOR/capitán |
| GET | `/pagos/pendientes` | Bandeja de pagos | ORGANIZADOR |
| GET | `/pagos/:id/revision` | Detalle de pago | ORGANIZADOR |
| GET | `/pagos/:id/revision/comprobante` | Comprobante para revisión | ORGANIZADOR |
| PATCH | `/pagos/:id/verificacion` | Verificar o rechazar | ORGANIZADOR |

**Regla de negocio:** la plataforma no cobra con tarjeta: registra depósitos y transferencias externas con comprobante. Los pagos en estado `PENDIENTE` reservan el disponible y solo `VERIFICADO` reduce el saldo. Montos expresados en USD con dos decimales.

### 8. Avisos (H15, H16, H19, H20)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/avisos` | Bandeja paginada | JUGADOR |
| GET | `/avisos/no-leidos/conteo` | Contador de pendientes | JUGADOR |
| GET | `/avisos/:avisoId` | Detalle propio | JUGADOR |
| PATCH | `/avisos/:avisoId/leido` | Marcar como leído | JUGADOR |

**H20 es un servicio interno**, no un endpoint HTTP de creación pública. La generación de avisos ocurre desde los módulos de calendario, pagos y resultados; véase `docs/contrato-avisos.md` original del backend.

### 9. Galería (H17, H18)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/partidos/:partidoId/galeria` | Listar contenido | ORGANIZADOR o JUGADOR autorizado |
| GET | `/partidos/:partidoId/galeria/:contenidoId/archivo` | Obtener medio | ORGANIZADOR o JUGADOR autorizado |
| POST | `/partidos/:partidoId/galeria` | Subir contenido multimedia | ORGANIZADOR |

### 10. Reportes (H21, H22)

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/reportes/pagos` | Estado de pagos de equipos | ORGANIZADOR |
| GET | `/temporadas/:temporadaId/reporte-deportivo` | Reporte estadístico de temporada | ORGANIZADOR |

### Operación de salud

| Método | Ruta | Descripción | Restricción |
|---|---|---|---|
| GET | `/` | Health check del API | Pública, bajo `/api/v1/` |

## Coherencia y mantenimiento de Swagger

El archivo **`src/create-app.ts` de `develop` aún anuncia «SI Backend Boilerplate»** y describe solo autenticación. Para cambiarlo se incluye en este paquete `backend/cambios-swagger/src/create-app.ts`, con reemplazo completo de ese archivo y metadatos de nPCs; no altera controladores ni lógica de negocio. En `develop`, los controladores ya utilizan `@ApiTags` y `@ApiOperation`; muchos también incluyen `@ApiBearerAuth`. La cobertura real de esquemas de respuesta, ejemplos, query strings y códigos de error **debe comprobarse contra OpenAPI generado**.

### Validación de Swagger antes de la release

1. Ejecutar backend con migraciones y variables válidas; abrir `/api/docs` y `/api/docs-json`.
2. Verificar que las operaciones de las tablas anteriores figuren en el JSON; comprobar `/api/v1` en las rutas y la excepción de fotos.
3. Comparar cada `requestBody`, `parameters`, `responses` y `security` de OpenAPI con los DTO, guards y pruebas en `develop`. No inventar esquemas que no estén representados en los DTO.
4. Probar con cada rol 200/201 en flujos permitidos y 400/401/403/404/409/422 en los escenarios descritos por cada historia.
5. Comparar el mismo documento y comportamiento contra HTTPS en producción después de fusionar `release/1.0.0`.

**Importante:** sin arrancar el backend y descargar `/api/docs-json`, la documentación puede estar actualizada en código sin haberse certificado el resultado generado. Este paquete deja una base trazable para terminar esa comprobación.
