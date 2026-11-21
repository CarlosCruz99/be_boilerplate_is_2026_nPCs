# Contrato central de avisos · H20

`AvisosModule` exporta `AvisosService`; `src/avisos/index.ts` exporta también los enums y tipos de `avisos.contract.ts`. No existe endpoint de creación: H19 es responsable de la bandeja y sus endpoints de lectura.

```ts
interface CrearAvisoDto {
  moduloOrigen: 'CALENDARIO' | 'PAGOS' | 'RESULTADOS';
  tipo:
    | 'PARTIDO_MODIFICADO'
    | 'JORNADA_PUBLICADA'
    | 'CUOTA_REGISTRADA'
    | 'PAGO_REGISTRADO'
    | 'RESULTADO_FINALIZADO'
    | 'RESULTADO_CORREGIDO';
  destinatario:
    { usuarioId: string } | { equipoId: number; temporadaId: number };
  titulo: string; // 1..120 caracteres, recortado
  mensaje: string; // 1..500 caracteres, recortado
  referencia?: { tipo: 'PARTIDO' | 'JORNADA' | 'CUOTA' | 'PAGO'; id: number };
  datos?: object; // JSON, máximo 2048 bytes (también en jsonb::text)
  claveIdempotencia?: string; // hasta 100 caracteres
}
```

| Tipo                                      | Módulo     |
| ----------------------------------------- | ---------- |
| PARTIDO_MODIFICADO, JORNADA_PUBLICADA     | CALENDARIO |
| CUOTA_REGISTRADA, PAGO_REGISTRADO         | PAGOS      |
| RESULTADO_FINALIZADO, RESULTADO_CORREGIDO | RESULTADOS |

`send(dto): Promise<{ avisosCreados: number; avisoIds: number[] }>` valida los campos y su correspondencia con class-validator y comprobaciones del contrato. Un dato inválido devuelve 400 identificando el campo. Una referencia destinataria inexistente devuelve 404 sin escribir. La referencia del aviso no tiene FK polimórfica: su existencia es responsabilidad del módulo que origina el evento.

Destinatario usuario crea una fila. Destinatario equipo consulta capitán y jugadores con cuenta vinculada en esa temporada; deduplica usuarios y omite fichas sin cuenta. El lote es atómico. Se usa `createManyAndReturn`, variante masiva de Prisma que permite devolver los ids realmente creados.

La clave se aplica por destinatario. `skipDuplicates` y el índice único de DB-20.1 hacen que los reintentos y envíos simultáneos no dupliquen. Un reintento devuelve cero ids nuevos; no modifica el aviso anterior. Sin clave, dos llamadas pueden crear dos avisos.

## Integración de los módulos · BE-20.2

Los módulos confirman primero la operación y después llaman a `send()` con una clave estable. Si PostgreSQL devuelve un fallo transitorio, el envío se intenta hasta tres veces más con esperas de 50, 100 y 200 ms. Cada intento abre una transacción nueva. Los errores de validación, destinatario inexistente y otros fallos permanentes se reportan en el primer intento. Al agotar los reintentos, el módulo emisor registra el fallo y conserva la operación ya confirmada. Los reintentos de bandeja ocurren durante la solicitud.

`send(dto, db)` admite una transacción del llamador para guardar el aviso y sus registros dependientes juntos. H15 la usa para programar el correo de cada equipo tras confirmar la edición. El reintento abarca esa transacción secundaria completa. Los envíos sin clave se intentan una vez.

| Módulo | Evento | Tipo y referencia | Destinatario | Clave de idempotencia | Responsable backend |
| --- | --- | --- | --- | --- | --- |
| Calendario | H15 · Cambio de fecha, hora o cancha | `PARTIDO_MODIFICADO` · `PARTIDO` | Ambos equipos, una llamada por equipo | `partido-{id}-cambio-{cambioId}` | Enoc Melara |
| Calendario | H16 · Publicación de jornada | `JORNADA_PUBLICADA` · `JORNADA` | Cada capitán con partido no cancelado | `jornada-{id}-capitan-{usuarioId}` | Carlos Cruz |
| Pagos | H12 · Registro de cuota | `CUOTA_REGISTRADA` · `CUOTA` | Capitán del equipo | `cuota-{id}-registrada` | Carlos Cruz |
| Pagos | H13 · Registro de pago | `PAGO_REGISTRADO` · `PAGO` | Capitán que registró el pago | `pago-{id}` | Carlos Cruz |
| Resultados | H5 · Finalización del partido | `RESULTADO_FINALIZADO` · `PARTIDO` | Ambos equipos, una llamada por equipo | `partido-{id}-finalizado` | Carlos Cruz |
| Resultados | H23 · Corrección oficial | `RESULTADO_CORREGIDO` · `PARTIDO` | Ambos equipos, una llamada por equipo | `partido-{id}-correccion-{correccionId}` | Enoc Melara |

```ts
// La publicación ya está confirmada.
try {
  await avisos.send(
    {
      moduloOrigen: 'CALENDARIO',
      tipo: 'JORNADA_PUBLICADA',
      destinatario: { usuarioId: capitanId },
      titulo: 'Calendario publicado: jornada 3',
      mensaje:
        'Tu equipo juega contra Leones el 2028-01-01 a las 20:30 en Cancha Norte.',
      referencia: { tipo: 'JORNADA', id: jornadaId },
      datos: {
        jornada: 3,
        rival: 'Leones',
        fecha: '2028-01-01',
        hora: '20:30',
        cancha: 'Cancha Norte',
      },
      claveIdempotencia: `jornada-${jornadaId}-capitan-${capitanId}`,
    },
  );
} catch (error) {
  logger.error({ evento: 'AVISO_JORNADA_PUBLICADA_FALLIDO', jornadaId });
}
```

`AvisosModule` concentra las escrituras sobre `aviso`. Los demás módulos pueden leer avisos persistidos para procesar sus entregas. `test/avisos/centralizacion.spec.ts` verifica el código de aplicación y se ejecuta con `npm test`.

## Aviso por cambio de partido · BE-15.1

La edición de un partido programado de una jornada publicada crea un aviso
`PARTIDO_MODIFICADO` por destinatario. Una edición puede registrar varios
campos en `cambio_partido` y agruparlos en el mismo aviso. El detalle de H19
devuelve `referencia: { tipo: 'PARTIDO', id: partidoId }` para abrir el partido
y los siguientes datos para mostrar los cambios.

```ts
type DatosCambioPartido = {
  equipoLocal: string;
  equipoVisitante: string;
  cambios: {
    campoModificado: 'FECHA' | 'HORA' | 'CANCHA';
    valorAnterior: string;
    valorNuevo: string;
  }[];
};
```

Las fechas y horas se expresan en hora de El Salvador con los formatos
`AAAA-MM-DD` y `HH:mm:ss.SSS`. Para una cancha se devuelve el nombre en el
aviso y se guardan los identificadores en el historial de cambios.

## Correo por cambio de partido · BE-15.2

El envío de H15 registra una entrega pendiente por destinatario en la misma
transacción que el aviso. Después de confirmar, el proceso de correo de H15
toma las entregas con un bloqueo de fila y usa el título y el mensaje del aviso.
Un fallo temporal admite hasta tres reintentos, con 30 segundos entre intentos.
El estado de la entrega se guarda por separado del aviso de la bandeja. El
proceso también lee las entregas pendientes con la clave anterior
`cambio-partido-{cambioId}`.

Para activar el envío, configura `RESEND_API_KEY` y `H15_CORREO_REMITENTE`
con un remitente autorizado por Resend. Con ambas variables vacías, la app
conserva las entregas pendientes. Resend recibe la misma clave por cambio y
destinatario en todos los intentos. Las entregas pendientes de 23 horas o más
pasan a fallidas al procesarse para respetar la ventana de deduplicación del
proveedor. [Idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)

## Verificación de BE-20.2

Pasaron 485 pruebas unitarias y 102 de integración en PostgreSQL 18. Las suites de calendario, pagos, resultados y bandeja verifican los seis eventos. Las pruebas de H16 simulan conflictos de serialización y comprueban el cuarto intento, el límite de reintentos y la conservación de la publicación. Las de H15 comprueban fallos al guardar el aviso o su entrega, además de las claves de correo anteriores. La compilación y el análisis estático finalizaron correctamente con dos advertencias preexistentes en los tests de seed.

Requisitos en Jira. [BE-20.2](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-145) · [BE-20.1](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-144) · [DB-20.1](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-143)
