import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type {
  ParticipantesRespuestaDto,
  RegistrarParticipantesDto,
} from '../dto/participantes.dto.js';

@Injectable()
export class ParticipantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}
  registrar(
    partidoId: number,
    dto: RegistrarParticipantesDto,
    usuario: ActorPartido,
  ): Promise<ParticipantesRespuestaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const referencia = await db.partido.findUnique({
          where: { id: partidoId },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('El partido no existe.');
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: {
            id: true,
            arbitroId: true,
            estado: true,
            temporadaId: true,
            equipoLocalId: true,
            equipoVisitanteId: true,
          },
        });
        if (!partido) throw new NotFoundException('El partido no existe.');
        this.autorizacion.exigirAsignacion(usuario, partido);
        if (partido.estado === 'FINALIZADO')
          throw new ConflictException(
            'El partido ya está finalizado. Solo procede la corrección autorizada (H23).',
          );
        if (partido.estado !== 'EN_CURSO')
          throw new ConflictException('El partido no está en curso.');
        const inscritos = await db.equipoJugador.findMany({
          where: {
            temporadaId: partido.temporadaId,
            equipoId: {
              in: [partido.equipoLocalId, partido.equipoVisitanteId],
            },
            jugadorId: { in: dto.jugadorIds },
          },
          select: {
            equipoId: true,
            jugadorId: true,
            jugador: { select: { nombreCompleto: true } },
          },
          orderBy: { jugadorId: 'asc' },
        });
        if (inscritos.length !== dto.jugadorIds.length)
          throw new UnprocessableEntityException(
            'Algún jugador no está inscrito en uno de los equipos en la temporada del partido.',
          );
        // Reemplazo atómico; no modifica estadistica_partido (H9), aun al vaciar la lista.
        await db.participacionPartido.deleteMany({ where: { partidoId } });
        if (inscritos.length)
          await db.participacionPartido.createMany({
            data: inscritos.map((j) => ({
              partidoId,
              equipoId: j.equipoId,
              jugadorId: j.jugadorId,
            })),
          });
        const equipo = (id: number) =>
          inscritos
            .filter((j) => j.equipoId === id)
            .map((j) => ({
              id: j.jugadorId,
              nombre: j.jugador.nombreCompleto,
            }));
        return {
          partidoId,
          local: equipo(partido.equipoLocalId),
          visitante: equipo(partido.equipoVisitanteId),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
