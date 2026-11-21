import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type { MesaPartidoRespuestaDto } from '../dto/mesa-partido.dto.js';

/** Estado operativo completo de un partido para la mesa del árbitro asignado (H5). */
@Injectable()
export class MesaPartidoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}

  consultar(
    partidoId: number,
    usuario: ActorPartido,
  ): Promise<MesaPartidoRespuestaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: {
            id: true,
            arbitroId: true,
            estado: true,
            equipoLocalId: true,
            equipoVisitanteId: true,
            golesLocal: true,
            golesVisitante: true,
            faltasLocal: true,
            faltasVisitante: true,
            inicioReal: true,
            finReal: true,
            local: { select: { nombre: true } },
            visitante: { select: { nombre: true } },
            participaciones: {
              select: {
                jugadorId: true,
                equipoId: true,
                equipoJugador: {
                  select: { jugador: { select: { nombreCompleto: true } } },
                },
              },
              orderBy: { jugadorId: 'asc' },
            },
          },
        });
        if (!partido) throw new NotFoundException('El partido no existe.');
        this.autorizacion.exigirAsignacion(usuario, partido);

        const participantesEquipo = (equipoId: number) =>
          partido.participaciones
            .filter((p) => p.equipoId === equipoId)
            .map((p) => ({
              id: p.jugadorId,
              nombre: p.equipoJugador.jugador.nombreCompleto,
            }));

        return {
          partidoId: partido.id,
          estado: partido.estado,
          local: {
            id: partido.equipoLocalId,
            nombre: partido.local.nombre,
          },
          visitante: {
            id: partido.equipoVisitanteId,
            nombre: partido.visitante.nombre,
          },
          golesLocal: partido.golesLocal,
          golesVisitante: partido.golesVisitante,
          faltasLocal: partido.faltasLocal,
          faltasVisitante: partido.faltasVisitante,
          inicioReal: partido.inicioReal?.toISOString() ?? null,
          finReal: partido.finReal?.toISOString() ?? null,
          participantes: {
            partidoId: partido.id,
            local: participantesEquipo(partido.equipoLocalId),
            visitante: participantesEquipo(partido.equipoVisitanteId),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
