# Consideraciones operativas y limitaciones conocidas

Esta página reúne características operativas de la implementación de nPCs que afectan la instalación y el uso del sistema. No se presenta como lista de incidencias sin reproducir.

## Almacenamiento de archivos

La API utiliza un directorio configurado mediante `UPLOADS_DIR` para administrar archivos. El entorno Docker Compose del backend declara un volumen `uploads` que conserva los datos entre reinicios del contenedor local. Los servicios de descarga privada comprueban el permiso del usuario antes de devolver comprobantes y medios protegidos.

En plataformas de contenedores con almacenamiento efímero, los archivos escritos en el sistema local no tienen garantizada su conservación entre recreaciones del servicio. Esta es una característica de la infraestructura, no una funcionalidad de almacenamiento externo implementada en el backend.

## Inicio de la instancia de la API

El backend se publica en Render. En modalidades que suspenden servicios por inactividad, la primera petición puede tardar más que las consultas posteriores. El navegador debe conservar sus mecanismos habituales de carga y manejo de errores.

## Integración frontend/backend

El frontend se publica en [Vercel](https://project-czgs9.vercel.app/login) y utiliza `API_URL` para comunicarse con la API de [Render](https://be-boilerplate-is-2026-npcs.onrender.com/api/docs). El backend declara el prefijo `/api/v1` para operaciones de dominio y publica la documentación de Swagger en `/api/docs`.

## Datos de demostración y aislamiento

Los datos semilla están destinados a recorrer los flujos del sistema. El acceso a los recursos depende de los roles `JUGADOR`, `ARBITRO` y `ORGANIZADOR`, además de la pertenencia a equipo o partido; la condición de capitán se determina a partir de `equipo.capitan_id`. Las cuentas de ejemplo no se deben confundir con usuarios reales.

## Alcance de pagos

Los pagos de cuotas se hacen fuera de la plataforma por depósito o transferencia. El sistema registra comprobantes y permite al organizador verificar o rechazar pagos; no procesa tarjetas bancarias ni ejecuta una pasarela de cobros.
