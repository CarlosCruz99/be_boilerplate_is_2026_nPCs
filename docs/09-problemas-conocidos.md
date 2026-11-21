# Problemas conocidos y pendientes de verificación

Se registran **inconsistencias verificadas de documentación/release** y verificaciones que faltan. No son defectos funcionales demostrados.

| Hallazgo | Evidencia / cómo comprobar | Impacto | Alcance |
|---|---|---|---|
| `main` del backend no contiene los módulos de `develop` | Comparar árboles de ambas ramas (101 vs 480 elementos en revisión) | Alto: riesgo de desplegar boilerplate | Publicación / todas las historias |
| `main` del frontend tampoco refleja el trabajo en `develop` | Comparar árboles (30 vs 497 elementos) | Alto: pantallas faltantes en entrega | Publicación |
| Swagger conserva metadatos de boilerplate en `develop` | `src/create-app.ts`: título «SI Backend Boilerplate» | Medio: API mal identificada | Documentación de API |
| README del backend declara dos modelos Prisma mientras schema actual contiene muchos más | Revisar apartado «Prisma en detalle» vs `prisma/schema.prisma` en `develop` | Medio: documentación inconsistente | Arquitectura / datos |
| README del frontend todavía incluye instrucciones genéricas de Next.js | Abrir README en `develop` | Medio: guía incompleta | Instalación / uso |
| No se confirmó URL HTTPS de frontend y Swagger | Revisar proveedor real y realizar solicitud externa | Alto: no es posible certificar entrega | Despliegue |
| Versión del backend sigue `0.0.1`, frontend `0.1.0` | Revisar `package.json` de `develop`; compararlas con tags | Medio: versión documental y release no alineadas | v1.0.0 |
| El Compose actual define API y PostgreSQL, no frontend | Revisar `docker-compose.yml` | Medio: la guía local debe ejecutar frontend aparte o agregarlo a Compose | Instalación local |
| Documentación Swagger no auditada en ejecución | Generar OpenAPI y comparar contra controladores/DTO y despliegue | Alto: no se puede afirmar cobertura completa | API |
| PR y tarjetas enlazados, pero aceptación en producción no certificada | `08-historias.md` contiene los enlaces verificados de 25 tarjetas Jira y PR asociados; falta validar los flujos desplegados | Alto: estado de release no certificado | Todas |
| H5: endpoint de mesa incorporado después del inventario anterior | [PR backend #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31), GET `/api/v1/partidos/:partidoId/mesa` y tres pruebas E2E nuevas | Resuelto en `develop` al commit `fbd2af9`; pendiente confirmar integración de producción | H5/H9 |
| Cobertura E2E global de H5 todavía no certificada como totalmente verde | Descripción del PR #31: 485 pruebas unitarias aprobadas, 3 E2E nuevas aprobadas; corrida global en Windows con 29/31 suites aprobadas y dos suites con timeout, intento Linux bloqueado por `ECONNRESET` en `npm ci` | Medio: requiere una repetición completa antes de release | QA / H5 |

## Acciones antes de la entrega

1. Mantener los enlaces de Jira y PR de H1–H25 del documento 08 actualizados y verificar estados y aceptación en el despliegue.
2. Corregir configuración Swagger y auditar todas las operaciones generadas.
3. Conciliar `develop`, `release/1.0.0` y `main` en ambos repositorios.
4. Registrar las URL públicas y verificar HTTPS, almacenamiento y datos semilla.
5. Ejecutar pruebas y reproducir flujos por rol en producción.


## Clasificación de evidencias

Los elementos de la tabla son **riesgos de documentación, publicación o verificaciones pendientes**. No se ha demostrado que las historias tengan defectos funcionales en runtime. Cuando las pruebas reales detecten un fallo, añadir: entorno, rol, URL sin secretos, datos de entrada reproducibles, resultado esperado, resultado observado y enlace a issue/PR.
