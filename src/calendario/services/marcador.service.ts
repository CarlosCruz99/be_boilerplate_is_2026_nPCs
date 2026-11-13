import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type {
  ActualizarMarcadorDto,
  MarcadorRespuestaDto,
} from '../dto/marcador.dto.js';

@Injectable()
export class MarcadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}

  actualizar(
    partidoId: number,
    dto: ActualizarMarcadorDto,
    usuario: ActorPartido,
  ): Promise<MarcadorRespuestaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const referencia = await db.partido.findUnique({
          where: { id: partidoId },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('El partido no existe.');
        // Orden común con calendario y la futura finalización/recálculo de H8.
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: { id: true, arbitroId: true, estado: true },
        });
        if (!partido) throw new NotFoundException('El partido no existe.');
        // Revalidar después del bloqueo: el guard pudo observar otra asignación.
        this.autorizacion.exigirAsignacion(usuario, partido);
        if (partido.estado === 'FINALIZADO')
          throw new ConflictException(
            'El partido ya está finalizado. Solo procede la corrección autorizada (H23).',
          );
        if (partido.estado === 'CANCELADO')
          throw new ConflictException(
            'No se puede actualizar el marcador de un partido cancelado.',
          );
        if (partido.estado !== 'EN_CURSO')
          throw new ConflictException('El partido aún no está en curso.');
        const valores = {
          golesLocal: dto.golesLocal,
          golesVisitante: dto.golesVisitante,
          faltasLocal: dto.faltasLocal,
          faltasVisitante: dto.faltasVisitante,
        };
        await db.partido.update({ where: { id: partidoId }, data: valores });
        const bitacora = await db.bitacoraMarcador.create({
          data: {
            ...valores,
            partidoId,
            usuarioId: usuario.id,
            accion: 'ACTUALIZAR',
            fechaRegistro: new Date(),
          },
          select: { fechaRegistro: true },
        });
        // El instante de respuesta es el persistido en la bitácora de esta actualización.
        return {
          partidoId,
          estado: 'EN_CURSO',
          ...valores,
          actualizadoEn: bitacora.fechaRegistro.toISOString(),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
