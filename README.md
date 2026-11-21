# nPCs — Plataforma de gestión deportiva (Liga amateur)

**Proyecto asignado:** Proyecto 5, plataforma de gestión deportiva (liga amateur).  
**Curso:** Ingeniería de Software, Universidad Centroamericana «José Simeón Cañas», ciclo 02/2026, sección 02.

La plataforma permite gestionar temporadas, inscripciones y plantillas, calendario y arbitraje, marcadores, posiciones, estadísticas, cuotas y comprobantes, avisos, galería y reportes. Aficionados pueden consultar resultados y posiciones sin cuenta.

## Ambiente desplegado

| Componente | URL |
|---|---|
| Frontend | **Pendiente de confirmar URL HTTPS pública** |
| API / Swagger | **Pendiente de confirmar** (`https://<host-backend>/api/docs`) |

> Las URLs de producción no están acreditadas por los archivos revisados; no confundir con `localhost`. Los usuarios de prueba y contraseñas se entregan **solo en Moodle**, no en Git.

## Integrantes

| Integrante | Responsabilidad principal en el README existente |
|---|---|
| Carlos Humberto Cruz Parada | Backend |
| Diego Benjamín Hurtado Ramos | Frontend |
| José Martín Luna Ramos | Frontend |
| Francisco Javier Martínez Donado | QA |
| Cristofer Enoc Melara Aldana | Documentación / Backend |
| Edson Enrique Palacios Quinteros | Base de datos |

Las responsabilidades por historia se detallan en [08-historias](docs/08-historias.md); la asignación final debe contrastarse con Jira.

## Documentación

1. [Guía de uso](docs/01-guia-de-uso.md)
2. [Arquitectura](docs/02-arquitectura.md)
3. [Modelo de datos](docs/03-modelo-de-datos.md)
4. [API y Swagger](docs/04-api.md)
5. [Instalación local](docs/05-instalacion-local.md)
6. [Despliegue](docs/06-despliegue.md)
7. [Forma de trabajo](docs/07-forma-de-trabajo.md)
8. [Historias por módulo](docs/08-historias.md)
9. [Problemas conocidos y pendientes](docs/09-problemas-conocidos.md)

**Repositorios:** [backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs) · [frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs). La documentación completa queda en el backend; el README del frontend debe enlazar a esta sección.

**Estado de revisión:** Base documental preparada contra `develop` (20-11-2026). **No equivale a certificar `main`, la release ni el despliegue.**


## Criterio de fidelidad documental

El contenido de estas páginas se preparó con base en la rama `develop` de ambos repositorios. La evidencia de rutas proviene de controladores y componentes, la de datos de `prisma/schema.prisma`, y la de comportamiento esperado de las historias aprobadas. **No se afirma que `main` o producción contengan todavía esta versión.** Las URLs reales y los estados de Jira y PR se completan al cerrar el despliegue.

## Actualización previa al primer release: H5

La rama `develop` del backend, al commit `fbd2af922f64b6a127190972b8e8cb3f78e2e554`, incorpora la consulta operativa de la mesa del árbitro `GET /api/v1/partidos/:partidoId/mesa` ([PR #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31)). La ruta es privada para el árbitro asignado y tiene contrato detallado en [04-api](docs/04-api.md). Este dato corresponde a `develop`, no constituye confirmación de publicación de `main` ni de Swagger en producción.
