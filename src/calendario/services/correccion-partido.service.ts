import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AvisosService } from '../../avisos/services/avisos.service.js';
import { PosicionesService } from '../../posiciones/posiciones.service.js';
import type {
  AplicarCorreccionDto,
  BitacoraCorreccionDto,
  CorreccionPartidoRespuestaDto,
} from '../dto/correccion-partido.dto.js';

@Injectable()
export class CorreccionPartidoService {
  private readonly logger = new Logger(CorreccionPartidoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posiciones: PosicionesService,
    private readonly avisos: AvisosService,
  ) {}

  async consultar(partidoId: number): Promise<BitacoraCorreccionDto[]> {
    const partido = await this.prisma.partido.findUnique({
      where: { id: partidoId },
      select: {
        correcciones: {
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            usuarioId: true,
            motivo: true,
            fecha: true,
            antes: true,
            despues: true,
            usuario: { select: { nombre: true } },
          },
        },
      },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');
    return partido.correcciones.map(({ usuario, fecha, ...correccion }) => ({
      ...correccion,
      responsable: usuario.nombre,
      fecha: fecha.toISOString(),
    }));
  }

  async aplicar(
    partidoId: number,
    dto: AplicarCorreccionDto,
    usuarioId: string,
  ): Promise<CorreccionPartidoRespuestaDto> {
    const { partido, correccionId, antes, despues } =
      await this.prisma.$transaction(
        async (db) => {
          const referencia = await db.partido.findUnique({
            where: { id: partidoId },
            select: { temporadaId: true },
          });
          if (!referencia) throw new NotFoundException('El partido no existe.');
          // El orden de H5 y H9 serializa las correcciones y el recálculo.
          await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
          await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
          const partido = await db.partido.findUnique({
            where: { id: partidoId },
            select: {
              estado: true,
              temporadaId: true,
              equipoLocalId: true,
              equipoVisitanteId: true,
              golesLocal: true,
              golesVisitante: true,
              jornada: { select: { numero: true } },
            },
          });
          if (!partido) throw new NotFoundException('El partido no existe.');
          if (partido.estado !== 'FINALIZADO') {
            throw new ConflictException(
              'Solo se puede corregir un partido Finalizado.',
            );
          }

          const estadisticas = (dto.estadisticas ?? [])
            .map(({ jugadorId, goles, asistencias, tarjetas }) => ({
              jugadorId,
              goles,
              asistencias,
              tarjetas,
            }))
            .sort((a, b) => a.jugadorId - b.jugadorId);
          const jugadorIds = estadisticas.map(({ jugadorId }) => jugadorId);
          const anteriores = jugadorIds.length
            ? await db.estadisticaPartido.findMany({
                where: { partidoId, jugadorId: { in: jugadorIds } },
                select: {
                  jugadorId: true,
                  goles: true,
                  asistencias: true,
                  tarjetas: true,
                },
                orderBy: { jugadorId: 'asc' },
              })
            : [];

          if (jugadorIds.length) {
            const inscritos = await db.equipoJugador.findMany({
              where: {
                jugadorId: { in: jugadorIds },
                temporadaId: partido.temporadaId,
                equipoId: {
                  in: [partido.equipoLocalId, partido.equipoVisitanteId],
                },
              },
              select: { jugadorId: true },
            });
            const inscritosIds = new Set(
              inscritos.map(({ jugadorId }) => jugadorId),
            );
            const invalido = jugadorIds.find((id) => !inscritosIds.has(id));
            if (invalido !== undefined) {
              throw new UnprocessableEntityException(
                `estadisticas: jugadorId ${invalido} no está inscrito en un equipo del partido.`,
              );
            }
          }

          const antes = {
            golesLocal: partido.golesLocal,
            golesVisitante: partido.golesVisitante,
            estadisticas: anteriores,
          };
          const marcador = {
            golesLocal: dto.golesLocal ?? partido.golesLocal,
            golesVisitante: dto.golesVisitante ?? partido.golesVisitante,
          };
          const despues = { ...marcador, estadisticas };
          const cambiaMarcador =
            antes.golesLocal !== marcador.golesLocal ||
            antes.golesVisitante !== marcador.golesVisitante;
          const anterioresPorJugador = new Map(
            anteriores.map((fila) => [fila.jugadorId, fila]),
          );
          const estadisticasModificadas = estadisticas.filter((fila) => {
            const previo = anterioresPorJugador.get(fila.jugadorId);
            return (
              !previo ||
              previo.goles !== fila.goles ||
              previo.asistencias !== fila.asistencias ||
              previo.tarjetas !== fila.tarjetas
            );
          });
          if (!cambiaMarcador && estadisticasModificadas.length === 0) {
            throw new BadRequestException(
              'La corrección debe cambiar el marcador o alguna estadística.',
            );
          }

          if (cambiaMarcador) {
            await db.partido.update({
              where: { id: partidoId },
              data: marcador,
            });
          }
          for (const fila of estadisticasModificadas) {
            const { jugadorId, ...cantidades } = fila;
            await db.estadisticaPartido.upsert({
              where: { partidoId_jugadorId: { partidoId, jugadorId } },
              create: { partidoId, ...fila },
              update: cantidades,
            });
          }
          const correccion = await db.correccionPartido.create({
            data: {
              partidoId,
              usuarioId,
              motivo: dto.motivo,
              antes,
              despues,
              fecha: new Date(),
            },
            select: { id: true },
          });
          await this.posiciones.recalcular(partido.temporadaId, db);
          return { partido, correccionId: correccion.id, antes, despues };
        },
        { isolationLevel: 'ReadCommitted' },
      );

    await Promise.all(
      [partido.equipoLocalId, partido.equipoVisitanteId].map(
        async (equipoId) => {
          try {
            await this.avisos.send({
              moduloOrigen: 'RESULTADOS',
              tipo: 'RESULTADO_CORREGIDO',
              destinatario: { equipoId, temporadaId: partido.temporadaId },
              titulo: 'Resultado corregido',
              mensaje: `El resultado del partido de la jornada ${partido.jornada.numero} se corrigió a ${despues.golesLocal}-${despues.golesVisitante}.`,
              referencia: { tipo: 'PARTIDO', id: partidoId },
              claveIdempotencia: `partido-${partidoId}-correccion-${correccionId}`,
            });
          } catch (error) {
            this.logger.error({
              evento: 'AVISO_RESULTADO_CORREGIDO_FALLIDO',
              partidoId,
              correccionId,
              equipoId,
              error: error instanceof Error ? error.name : 'Error desconocido',
            });
          }
        },
      ),
    );

    return { partidoId, estado: 'FINALIZADO', correccionId, antes, despues };
  }
}
