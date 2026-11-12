import { Injectable } from '@nestjs/common';
import type { CampoCambioPartido, Prisma } from '@PrismaClient';
import { AvisosService } from '../../avisos/services/avisos.service.js';
import { fechaCivilSalvador } from '../utils/fecha-salvador.js';

interface HorarioPartido {
  inicio: Date;
  canchaId: number;
  cancha: { nombre: string };
}

interface PartidoEditado extends HorarioPartido {
  id: number;
  equipoLocalId: number;
  equipoVisitanteId: number;
  local: { nombre: string };
  visitante: { nombre: string };
}

interface Cambio {
  campoModificado: CampoCambioPartido;
  valorAnterior: string;
  valorNuevo: string;
}

const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/El_Salvador',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});

@Injectable()
export class AvisosCambioPartidoService {
  constructor(private readonly avisos: AvisosService) {}

  async registrar(
    db: Prisma.TransactionClient,
    temporadaId: number,
    organizadorId: string,
    anterior: HorarioPartido,
    partido: PartidoEditado,
  ): Promise<void> {
    const cambios: Cambio[] = [
      {
        campoModificado: 'FECHA',
        valorAnterior: fechaCivilSalvador(anterior.inicio),
        valorNuevo: fechaCivilSalvador(partido.inicio),
      },
      {
        campoModificado: 'HORA',
        valorAnterior: formatoHora.format(anterior.inicio),
        valorNuevo: formatoHora.format(partido.inicio),
      },
      {
        campoModificado: 'CANCHA',
        valorAnterior: String(anterior.canchaId),
        valorNuevo: String(partido.canchaId),
      },
    ];
    const modificados = cambios.filter(
      ({ valorAnterior, valorNuevo }) => valorAnterior !== valorNuevo,
    );
    if (modificados.length === 0) return;

    const registrados = await db.cambioPartido.createManyAndReturn({
      data: modificados.map((cambio) => ({
        ...cambio,
        partidoId: partido.id,
        modificadoPor: organizadorId,
      })),
      select: { id: true },
    });
    const cambioId = Math.min(...registrados.map(({ id }) => id));
    const detalles = modificados.map((cambio) =>
      cambio.campoModificado === 'CANCHA'
        ? {
            campoModificado: cambio.campoModificado,
            valorAnterior: anterior.cancha.nombre,
            valorNuevo: partido.cancha.nombre,
          }
        : cambio,
    );
    const equipoLocal = partido.local.nombre;
    const equipoVisitante = partido.visitante.nombre;
    const resumen = detalles
      .map(
        ({ campoModificado, valorAnterior, valorNuevo }) =>
          `${campoModificado}: ${valorAnterior} → ${valorNuevo}`,
      )
      .join('. ');
    const claveIdempotencia = `cambio-partido-${cambioId}`;
    for (const equipoId of [partido.equipoLocalId, partido.equipoVisitanteId]) {
      // La misma clave deduplica a quien pertenece a ambos grupos de destinatarios.
      await this.avisos.send(
        {
          moduloOrigen: 'CALENDARIO',
          tipo: 'PARTIDO_MODIFICADO',
          destinatario: { equipoId, temporadaId },
          titulo: 'Cambio en tu partido',
          mensaje: `${equipoLocal} vs. ${equipoVisitante}. ${resumen}.`,
          referencia: { tipo: 'PARTIDO', id: partido.id },
          datos: { equipoLocal, equipoVisitante, cambios: detalles },
          claveIdempotencia,
        },
        db,
      );
    }
    await db.$executeRaw`
      INSERT INTO entrega_correo(cambio_id, usuario_id)
      SELECT ${cambioId}, usuario_id FROM aviso
      WHERE clave_idempotencia = ${claveIdempotencia}
        AND tipo = 'PARTIDO_MODIFICADO' AND referencia_id = ${partido.id}
      ON CONFLICT (cambio_id, usuario_id) DO NOTHING
    `;
  }
}
