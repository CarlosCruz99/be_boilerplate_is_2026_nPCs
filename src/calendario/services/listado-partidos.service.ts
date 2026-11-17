import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma, User } from '@PrismaClient';
import type {
  ListadoPartidosQueryDto,
  ListadoPartidosRespuestaDto,
} from '../dto/listado-partidos.dto.js';

@Injectable()
export class ListadoPartidosService {
  constructor(private readonly prisma: PrismaService) {}
  listar(
    query: ListadoPartidosQueryDto,
    usuario?: Pick<User, 'rol' | 'isActive'>,
  ): Promise<ListadoPartidosRespuestaDto> {
    const { page, pageSize, equipoId, estado } = query;
    const skip = (page - 1) * pageSize;
    if (skip > 2147483647)
      throw new BadRequestException(
        'La página solicitada supera el rango admitido.',
      );
    const where: Prisma.PartidoWhereInput = {
      estado: estado ?? { in: ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'] },
      ...(usuario?.rol === 'ORGANIZADOR' && usuario.isActive
        ? {}
        : { jornada: { estado: 'PUBLICADA' } }),
      ...(equipoId === undefined
        ? {}
        : {
            OR: [{ equipoLocalId: equipoId }, { equipoVisitanteId: equipoId }],
          }),
    };
    // Mismo filtro y snapshot para mantener coherentes total y filas con escrituras concurrentes.
    return this.prisma.$transaction(
      async (db) => {
        const total = await db.partido.count({ where });
        const filas = await db.partido.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            inicio: true,
            estado: true,
            golesLocal: true,
            golesVisitante: true,
            jornada: { select: { numero: true } },
            local: { select: { id: true, nombre: true } },
            visitante: { select: { id: true, nombre: true } },
          },
        });
        return {
          total,
          page,
          pageSize,
          partidos: filas.map((p) => ({
            id: p.id,
            jornada: p.jornada.numero,
            inicio: p.inicio.toISOString(),
            estado: p.estado,
            local: {
              ...p.local,
              goles: p.estado === 'PROGRAMADO' ? null : p.golesLocal,
            },
            visitante: {
              ...p.visitante,
              goles: p.estado === 'PROGRAMADO' ? null : p.golesVisitante,
            },
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
