# Guía de uso

**Sitio web:** [nPCs](https://project-czgs9.vercel.app/login).

## Roles y permisos

| Tipo de usuario | Capacidades |
|---|---|
| Aficionado (sin cuenta) | Consultar partidos, marcadores y posiciones de jornadas publicadas |
| Jugador | Registrarse, vincular ficha, consultar calendario de su equipo, estadísticas personales, galería autorizada y avisos |
| Capitán (condición derivada, no rol persistido) | Además de las acciones de jugador, inscribir equipo y jugadores, ver próximos rivales, cuotas, reportar pagos y consultar historial |
| Árbitro | Gestionar inicio, marcador, faltas, participantes y estadísticas de partidos asignados, finalizar partidos |
| Organizador | Validar inscripciones, generar y publicar calendario, asignar árbitros, cuotas, pagos, galería, correcciones y reportes |

**Nota:** La cuenta guarda únicamente JUGADOR, ARBITRO u ORGANIZADOR. La capitanía se deriva de `equipo.capitan_id` para cada temporada. Árbitros y organizadores se crean con datos semilla; el registro público crea jugadores.

## Flujos principales

### Registro, equipo e inscripción (H1–H2)

1. Abrir `/registro` y crear una cuenta de jugador.
2. Desde `/equipos/nuevo`, elegir temporada con inscripción abierta y crear el equipo.
3. Abrir `/equipos/{id}/jugadores`, registrar fichas y adjuntar fotografías válidas.
4. El organizador entra en `/organizador/equipos`, revisa plantilla y aprueba o rechaza con motivo.
5. Un jugador puede entrar en `/vincular-ficha` para asociar su cuenta a una ficha existente.

![Pantalla de inscripción](https://raw.githubusercontent.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/develop/docs/evidence/inscripcion-360.png)

### Calendario, árbitros y marcadores (H3–H9, H16, H23, H25)

1. El organizador gestiona el calendario desde `/organizador/calendario`, genera y publica jornadas, y asigna árbitros.
2. Jugadores y capitanes consultan `/mi-calendario`; aficionados ven `/partidos` y `/posiciones`.
3. El árbitro accede a `/arbitro/partidos` y abre la mesa del partido que tiene asignado. El backend carga su estado mediante `GET /api/v1/partidos/:partidoId/mesa`, con equipos, marcador, faltas, tiempos reales y participantes; la consulta requiere autenticación y ser el árbitro asignado (H5, [PR backend #31](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/31)). Desde la mesa puede iniciar el partido, actualizar marcador y participantes, registrar estadísticas individuales (H9) y finalizarlo. El nuevo GET es de **solo lectura** y permite consultar datos aunque el partido esté Programado, En curso, Finalizado o Cancelado; las acciones de escritura conservan sus restricciones de estado y permisos.
4. El organizador puede corregir resultados finalizados mediante el flujo autorizado de H23.

![Calendario del organizador](https://raw.githubusercontent.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/develop/docs/evidence/h3-partido-real-escritorio.png)

### Pagos y cuotas (H12–H14, H21, H24)

1. El organizador registra cuotas en `/organizador/cuotas`.
2. El capitán revisa `/equipo/cuotas`, reporta depósito o transferencia y sube el comprobante.
3. El organizador verifica o rechaza el pago en `/organizador/pagos`.
4. El capitán consulta `/equipo/pagos`; el organizador dispone del reporte `/reportes/pagos`.

Los pagos **no se procesan con tarjeta**: se registran transferencias o depósitos externos, sujetos a verificación.

### Estadísticas, galería, avisos y reportes (H10–H11, H15, H17–H22)

El jugador consulta `/mis-estadisticas`; el organizador revisa `/organizador/destacados`, `/reportes/deportivo` y `/reportes/pagos`. Los usuarios autorizados consultan `/avisos`. Las galerías se abren desde `/partidos/{id}/galeria`, con carga disponible para el organizador. El acceso a medios no es público por defecto.

## Evidencias

Las capturas y verificaciones adicionales están en el [directorio de evidencias del frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/tree/develop/docs/evidence). Las imágenes precedentes están enlazadas desde `develop`; para la entrega final conviene copiarlas a `docs/img/` en la rama de publicación.


## Evidencia visual adicional disponible en `develop`

Las capturas existentes en el frontend pueden incorporarse como evidencias sin recrear pantallas:

- [Login escritorio](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/matchday/login-real-desktop.png) y [registro móvil](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/matchday/publico--registro-360.png).
- [Organizador: calendario](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/matchday/organizador--organizador-calendario-1440.png) y [validación de equipos](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/h2-real-cupo-escritorio.png).
- [Árbitro: partido](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/matchday/arbitro--arbitro-partidos-1-1440.png) y [estadísticas](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/matchday/arbitro--arbitro-partidos-1-estadisticas-360.png).
- [Marcador público](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/h6/detalle-1440.png), [posiciones](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/h7/publica-1440.png) y [galería móvil](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/blob/develop/docs/evidence/nord/galeria-movil.png).

Las capturas y evidencias de las interfaces están organizadas en el directorio `docs/evidence/` del repositorio frontend. El acceso de prueba comienza en [Inicio de sesión](https://project-czgs9.vercel.app/login).
