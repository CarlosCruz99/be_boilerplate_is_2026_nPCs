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

## Integración transaccional

Se admite `send(dto, db)` con un `Prisma.TransactionClient` opcional. Sin cliente abre su propia transacción; con cliente participa en la del llamador, sin crear otra. El llamador debe propagar cualquier error para que se revierta también el evento de negocio.

```ts
await prisma.$transaction(async (db) => {
  // Publicar y enviar en la misma transacción; sin escrituras directas a aviso.
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
    db,
  );
});
```

El servicio central escribe los avisos de la aplicación. Los módulos le delegan la creación y pueden consultar los avisos persistidos para procesar sus propias entregas.

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

La edición registra una entrega pendiente por destinatario en la misma
transacción que el aviso. Después de confirmar, el proceso de correo de H15
toma las entregas con un bloqueo de fila y usa el título y el mensaje del aviso.
Un fallo temporal admite hasta tres reintentos, con 30 segundos entre intentos.
El estado de la entrega se guarda por separado del aviso de la bandeja.

Para activar el envío, configura `RESEND_API_KEY` y `H15_CORREO_REMITENTE`
con un remitente autorizado por Resend. Con ambas variables vacías, la app
conserva las entregas pendientes. Resend recibe la misma clave por cambio y
destinatario en todos los intentos. Las entregas pendientes de 23 horas o más
pasan a fallidas al procesarse para respetar la ventana de deduplicación del
proveedor. [Idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)

Fuentes: [BE-20.1 / NPCS-144](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-144), [DB-20.1 / NPCS-143](https://uca-team-zec8wzmz.atlassian.net/browse/NPCS-143). El servicio se agregó como dependencia autorizada de BE-16.1. La revisión y coordinación de su adopción con el responsable de H20 queda para el PR; no se actualizaron estados de Jira ni se enviaron mensajes a otros integrantes.
