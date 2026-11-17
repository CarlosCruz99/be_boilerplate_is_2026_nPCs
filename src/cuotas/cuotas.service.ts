import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AvisosService } from '../avisos/services/avisos.service.js';
import { fechaCivilSalvador } from '../calendario/utils/fecha-salvador.js';
import { type CrearCuotaDto, type CuotaRespuestaDto } from './cuota.dto.js';

@Injectable()
export class CuotasService {
  private readonly logger = new Logger(CuotasService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}
  async crear(
    dto: CrearCuotaDto,
    organizadorId: string,
  ): Promise<CuotaRespuestaDto> {
    if (dto.concepto === 'INSCRIPCION' && dto.partidoId != null)
      throw new BadRequestException(
        'La cuota de inscripción no admite partidoId.',
      );
    let resultado;
    try {
      resultado = await this.prisma.$transaction(
        async (db) => {
          const temporada = await db.temporada.findUnique({
            where: { id: dto.temporadaId },
            select: { id: true },
          });
          if (!temporada)
            throw new NotFoundException('La temporada no existe.');
          await db.$queryRaw`SELECT id FROM temporada WHERE id=${dto.temporadaId} FOR UPDATE`;
          const equipo = await db.equipo.findUnique({
            where: { id: dto.equipoId },
            select: { temporadaId: true, estado: true, capitanId: true },
          });
          if (!equipo) throw new NotFoundException('El equipo no existe.');
          if (
            equipo.temporadaId !== dto.temporadaId ||
            equipo.estado !== 'INSCRITO'
          )
            throw new UnprocessableEntityException(
              'El equipo debe estar inscrito en la temporada seleccionada.',
            );
          if (dto.concepto === 'ARBITRAJE') {
            await db.$queryRaw`SELECT id FROM partido WHERE id=${dto.partidoId!} FOR UPDATE`;
            const partido = await db.partido.findUnique({
              where: { id: dto.partidoId! },
              select: {
                temporadaId: true,
                equipoLocalId: true,
                equipoVisitanteId: true,
                estado: true,
              },
            });
            if (!partido) throw new NotFoundException('El partido no existe.');
            if (
              partido.temporadaId !== dto.temporadaId ||
              ![partido.equipoLocalId, partido.equipoVisitanteId].includes(
                dto.equipoId,
              ) ||
              partido.estado === 'CANCELADO'
            )
              throw new UnprocessableEntityException(
                'El partido debe pertenecer a la temporada, incluir al equipo y no estar cancelado.',
              );
          }
          // Revalidar hoy después de los bloqueos (la petición pudo esperar hasta otro día).
          if (dto.fechaVencimiento < fechaCivilSalvador())
            throw new BadRequestException(
              'La fecha de vencimiento no puede ser anterior a hoy en El Salvador.',
            );
          const cuota = await db.cuota.create({
            data: {
              temporadaId: dto.temporadaId,
              equipoId: dto.equipoId,
              concepto: dto.concepto,
              monto: dto.monto,
              fechaVencimiento: new Date(dto.fechaVencimiento + 'T00:00:00Z'),
              partidoId: dto.partidoId ?? null,
              creadoPor: organizadorId,
            },
          });
          return { cuota, capitanId: equipo.capitanId };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ya existe una cuota de ese concepto para el equipo y la temporada o partido.',
        );
      throw error;
    }
    const { cuota, capitanId } = resultado;
    const respuesta: CuotaRespuestaDto = {
      id: cuota.id,
      temporadaId: cuota.temporadaId,
      equipoId: cuota.equipoId,
      concepto: cuota.concepto,
      monto: cuota.monto.toFixed(2),
      fechaVencimiento: cuota.fechaVencimiento.toISOString().slice(0, 10),
      partidoId: cuota.partidoId,
    };
    try {
      await this.avisos.send({
        moduloOrigen: 'PAGOS',
        tipo: 'CUOTA_REGISTRADA',
        destinatario: { usuarioId: capitanId },
        titulo: `Nueva cuota: ${cuota.concepto === 'INSCRIPCION' ? 'Inscripción' : 'Arbitraje'}`,
        mensaje: `Se registró una cuota de $${respuesta.monto} con vencimiento ${respuesta.fechaVencimiento}.`,
        referencia: { tipo: 'CUOTA', id: cuota.id },
        claveIdempotencia: `cuota-${cuota.id}-registrada`,
      });
    } catch (error) {
      this.logger.error({
        evento: 'AVISO_CUOTA_FALLIDO',
        cuotaId: cuota.id,
        usuarioId: capitanId,
        fecha: new Date().toISOString(),
        error: error instanceof Error ? error.name : 'Error desconocido',
      });
      respuesta.advertencia =
        'La cuota se registró, pero no se pudo enviar el aviso al capitán.';
    }
    return respuesta;
  }
}
