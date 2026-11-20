import { Injectable, Logger } from '@nestjs/common';
import type { CampoCambioPartido, Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import type { CrearAvisoDto } from '../../avisos/avisos.contract.js';
import { AvisosService } from '../../avisos/services/avisos.service.js';
import { reintentarEnvioAviso } from '../../avisos/services/reintentar-envio-aviso.js';
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

type AvisoCambio = CrearAvisoDto & {
  referencia: { tipo: 'PARTIDO'; id: number };
  claveIdempotencia: string;
};

interface AvisosCambioPartido {
  cambioId: number;
  avisos: AvisoCambio[];
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
  private readonly logger = new Logger(AvisosCambioPartidoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  async registrar(
    db: Prisma.TransactionClient,
    temporadaId: number,
    organizadorId: string,
    anterior: HorarioPartido,
    partido: PartidoEditado,
  ): Promise<AvisosCambioPartido | undefined> {
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
    const claveIdempotencia = `partido-${partido.id}-cambio-${cambioId}`;
    return {
      cambioId,
      // La misma clave deduplica a quien pertenece a ambos grupos de destinatarios.
      avisos: [partido.equipoLocalId, partido.equipoVisitanteId].map(
        (equipoId) => ({
          moduloOrigen: 'CALENDARIO',
          tipo: 'PARTIDO_MODIFICADO',
          destinatario: { equipoId, temporadaId },
          titulo: 'Cambio en tu partido',
          mensaje: `${equipoLocal} vs. ${equipoVisitante}. ${resumen}.`,
          referencia: { tipo: 'PARTIDO', id: partido.id },
          datos: { equipoLocal, equipoVisitante, cambios: detalles },
          claveIdempotencia,
        }),
      ),
    };
  }

  async enviar({ cambioId, avisos }: AvisosCambioPartido): Promise<void> {
    for (const aviso of avisos) {
      try {
        await reintentarEnvioAviso(() =>
          this.prisma.$transaction(async (db) => {
            await this.avisos.send(aviso, db);
            // Cada aviso y su entrega de correo se confirman juntos después de la edición.
            await db.$executeRaw`
              INSERT INTO entrega_correo(cambio_id, usuario_id)
              SELECT ${cambioId}, usuario_id FROM aviso
              WHERE clave_idempotencia = ${aviso.claveIdempotencia}
                AND tipo = 'PARTIDO_MODIFICADO' AND referencia_id = ${aviso.referencia.id}
              ON CONFLICT (cambio_id, usuario_id) DO NOTHING
            `;
          }),
        );
      } catch (error) {
        this.logger.error({
          evento: 'AVISO_PARTIDO_MODIFICADO_FALLIDO',
          cambioId,
          partidoId: aviso.referencia.id,
          destinatario: aviso.destinatario,
          error: error instanceof Error ? error.name : 'Error desconocido',
        });
      }
    }
  }
}
