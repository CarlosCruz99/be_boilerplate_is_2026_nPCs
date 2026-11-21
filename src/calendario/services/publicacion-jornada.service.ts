import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AvisosService } from '../../avisos/services/avisos.service.js';
import { avisosPublicacion } from '../utils/avisos-publicacion.js';
import type { JornadaPublicadaDto } from '../dto/publicacion-jornada.dto.js';

@Injectable()
export class PublicacionJornadaService {
  private readonly logger = new Logger(PublicacionJornadaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  async publicar(
    id: number,
    organizadorId: string,
  ): Promise<JornadaPublicadaDto> {
    const { respuesta, avisos } = await this.prisma.$transaction(
      async (db) => {
        const referencia = await db.jornada.findUnique({
          where: { id },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('La jornada no existe.');
        // Orden compartido con BE-3.1 y BE-3.2: el calendario no puede cambiar
        // mientras se publica su instantánea y se construyen los avisos.
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM jornada WHERE id=${id} FOR NO KEY UPDATE`;
        const jornada = await db.jornada.findUnique({
          where: { id },
          select: { id: true, numero: true, estado: true },
        });
        if (!jornada) throw new NotFoundException('La jornada no existe.');
        if (jornada.estado === 'PUBLICADA')
          throw new ConflictException('La jornada ya está publicada.');
        const partidos = await db.partido.findMany({
          where: { jornadaId: id, estado: { not: 'CANCELADO' } },
          orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
          select: {
            inicio: true,
            cancha: { select: { nombre: true } },
            local: { select: { nombre: true, capitanId: true } },
            visitante: { select: { nombre: true, capitanId: true } },
          },
        });
        if (!partidos.length)
          throw new UnprocessableEntityException(
            'La jornada no tiene partidos no cancelados para publicar.',
          );
        const publicadaEn = new Date();
        await db.jornada.update({
          where: { id },
          data: {
            estado: 'PUBLICADA',
            publicadaEn,
            publicadaPorId: organizadorId,
          },
        });
        return {
          respuesta: {
            id,
            estado: 'PUBLICADA' as const,
            publicadaEn: publicadaEn.toISOString(),
          },
          avisos: avisosPublicacion(jornada, partidos),
        };
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 },
    );

    for (const aviso of avisos) {
      try {
        await this.avisos.send(aviso);
      } catch (error) {
        this.logger.error({
          evento: 'AVISO_JORNADA_PUBLICADA_FALLIDO',
          jornadaId: id,
          destinatario: aviso.destinatario,
          error: error instanceof Error ? error.name : 'Error desconocido',
        });
      }
    }
    return respuesta;
  }
}
