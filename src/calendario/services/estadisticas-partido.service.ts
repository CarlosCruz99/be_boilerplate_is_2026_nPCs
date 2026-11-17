import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type {
  CantidadesEstadisticaDto,
  EstadisticasPartidoDto,
  RegistroEstadisticaDto,
} from '../dto/estadisticas-partido.dto.js';

const registroSelect = {
  jugadorId: true,
  goles: true,
  asistencias: true,
  tarjetas: true,
};

@Injectable()
export class EstadisticasPartidoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}

  consultar(
    partidoId: number,
    usuario: ActorPartido,
  ): Promise<EstadisticasPartidoDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const partido = await this.partidoAutorizado(db, partidoId, usuario);
        const inscritos = await db.equipoJugador.findMany({
          where: {
            temporadaId: partido.temporadaId,
            equipoId: {
              in: [partido.equipoLocalId, partido.equipoVisitanteId],
            },
          },
          select: {
            jugadorId: true,
            equipoId: true,
            jugador: { select: { nombreCompleto: true } },
          },
          orderBy: [
            { equipoId: 'asc' },
            { jugador: { nombreCompleto: 'asc' } },
            { jugadorId: 'asc' },
          ],
        });
        const registros = await db.estadisticaPartido.findMany({
          where: { partidoId },
          select: registroSelect,
          orderBy: { jugadorId: 'asc' },
        });
        return {
          partidoId,
          temporadaId: partido.temporadaId,
          estado: partido.estado,
          resultadoOficial: partido.estado === 'FINALIZADO',
          jugadoresHabilitados: inscritos.map(
            ({ jugadorId, equipoId, jugador }) => ({
              jugadorId,
              equipoId,
              nombre: jugador.nombreCompleto,
            }),
          ),
          registros,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  guardar(
    partidoId: number,
    jugadorId: number,
    cantidades: CantidadesEstadisticaDto,
    usuario: ActorPartido,
  ): Promise<RegistroEstadisticaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const referencia = await db.partido.findUnique({
          where: { id: partidoId },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('El partido no existe.');
        // BE-5.2 y H25 toman los mismos bloqueos en este orden.
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
        const partido = await this.partidoAutorizado(db, partidoId, usuario);
        if (partido.estado === 'FINALIZADO') {
          throw new ConflictException(
            'El partido ya está finalizado. Solo procede la corrección autorizada (H23).',
          );
        }
        if (partido.estado !== 'EN_CURSO') {
          throw new ConflictException('El partido no está en curso.');
        }

        const jugador = await db.jugador.findUnique({
          where: { id: jugadorId },
          select: {
            equipos: {
              where: {
                temporadaId: partido.temporadaId,
                equipoId: {
                  in: [partido.equipoLocalId, partido.equipoVisitanteId],
                },
              },
              select: { equipoId: true },
            },
          },
        });
        if (!jugador) throw new NotFoundException('El jugador no existe.');
        if (jugador.equipos.length === 0) {
          throw new UnprocessableEntityException(
            'El jugador no está inscrito en un equipo participante de esta temporada.',
          );
        }

        const where = { partidoId_jugadorId: { partidoId, jugadorId } };
        const previo = await db.estadisticaPartido.findUnique({
          where,
          select: registroSelect,
        });
        if (
          previo &&
          previo.goles === cantidades.goles &&
          previo.asistencias === cantidades.asistencias &&
          previo.tarjetas === cantidades.tarjetas
        ) {
          return previo;
        }
        return db.estadisticaPartido.upsert({
          where,
          create: {
            partidoId,
            jugadorId,
            goles: cantidades.goles,
            asistencias: cantidades.asistencias,
            tarjetas: cantidades.tarjetas,
          },
          update: cantidades,
          select: registroSelect,
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async partidoAutorizado(
    db: Prisma.TransactionClient,
    partidoId: number,
    usuario: ActorPartido,
  ) {
    const partido = await db.partido.findUnique({
      where: { id: partidoId },
      select: {
        id: true,
        arbitroId: true,
        temporadaId: true,
        equipoLocalId: true,
        equipoVisitanteId: true,
        estado: true,
      },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');
    this.autorizacion.exigirAsignacion(usuario, partido);
    return partido;
  }
}
