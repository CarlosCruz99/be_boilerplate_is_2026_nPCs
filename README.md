# nPCs — Plataforma de gestión deportiva (Liga amateur)

**Proyecto asignado:** Proyecto 5, plataforma de gestión deportiva (liga amateur).  
**Curso:** Ingeniería de Software, Universidad Centroamericana «José Simeón Cañas», ciclo 02/2026, sección 02.

La plataforma permite gestionar temporadas, inscripciones y plantillas, calendario y arbitraje, marcadores, posiciones, estadísticas, cuotas y comprobantes, avisos, galería y reportes. Aficionados pueden consultar resultados y posiciones sin cuenta.

## Ambiente desplegado

| Componente | URL |
|---|---|
| Frontend | [https://project-czgs9.vercel.app/login](https://project-czgs9.vercel.app/login) |
| API / Swagger | [https://be-boilerplate-is-2026-npcs.onrender.com/api/docs](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs) |

> La aplicación web se publica en Vercel y la API NestJS en Render. Las credenciales de prueba se entregan por el canal definido por la cátedra, no en Git.

## Integrantes

| Integrante | Responsabilidad principal en el README existente |
|---|---|
| Carlos Humberto Cruz Parada | Backend |
| Diego Benjamín Hurtado Ramos | Frontend |
| José Martín Luna Ramos | Frontend |
| Francisco Javier Martínez Donado | QA |
| Cristofer Enoc Melara Aldana | Documentación / Backend |
| Edson Enrique Palacios Quinteros | Base de datos |

Las responsabilidades por historia y los enlaces a Jira están disponibles en [08-historias](docs/08-historias.md).

## Documentación

1. [Guía de uso](docs/01-guia-de-uso.md)
2. [Arquitectura](docs/02-arquitectura.md)
3. [Modelo de datos](docs/03-modelo-de-datos.md)
4. [API y Swagger](docs/04-api.md)
5. [Instalación local](docs/05-instalacion-local.md)
6. [Despliegue](docs/06-despliegue.md)
7. [Forma de trabajo](docs/07-forma-de-trabajo.md)
8. [Historias por módulo](docs/08-historias.md)
9. [Limitaciones conocidas](docs/09-problemas-conocidos.md)

**Repositorios:** [backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs) · [frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs). La documentación completa queda en el backend y el README del frontend enlaza a ella.

**Código de referencia del backend:** rama `main`, commit [`ec123e3`](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/commit/ec123e33697d5521b4ea82eba4cf3a6f1f7380db), integración de la versión 1.0.0.


## Criterio de fidelidad documental

Esta documentación describe el backend publicado en `main`, la interfaz de la liga y los contratos declarados en el código. Acceso web: [https://project-czgs9.vercel.app/login](https://project-czgs9.vercel.app/login). API documentada: [https://be-boilerplate-is-2026-npcs.onrender.com/api/docs](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs).

## Mesa del árbitro (H5)

La ruta protegida `GET /api/v1/partidos/:partidoId/mesa` permite al árbitro asignado consultar el estado operativo del partido. Fue incluida mediante el [PR backend #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31) y forma parte del backend de `main`. El contrato se detalla en [04-api](docs/04-api.md).