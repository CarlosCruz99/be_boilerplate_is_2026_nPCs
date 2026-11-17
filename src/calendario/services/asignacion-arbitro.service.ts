import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
  ArbitroAsignadoRespuestaDto,
  ArbitrosDisponiblesRespuestaDto,
} from '../dto/asignacion-arbitro.dto.js';
import { traducirConflictoPartido } from '../utils/conflictos-partido.js';

@Injectable()
export class AsignacionArbitroService {
  constructor(private readonly prisma: PrismaService) {}
  async disponibles(id: number): Promise<ArbitrosDisponiblesRespuestaDto> {
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      select: { inicio: true, fin: true, estado: true },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');
    if (partido.estado !== 'PROGRAMADO')
      throw new ConflictException(
        'Solo se puede asignar árbitro a un partido Programado.',
      );
    const arbitros = await this.prisma.user.findMany({
      where: {
        rol: 'ARBITRO',
        isActive: true,
        partidosArbitro: {
          none: {
            id: { not: id },
            estado: { not: 'CANCELADO' },
            inicio: { lt: partido.fin },
            fin: { gt: partido.inicio },
          },
        },
      },
      select: { id: true, nombre: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    return { partidoId: id, arbitros };
  }
  async asignar(
    id: number,
    arbitroId: string,
  ): Promise<ArbitroAsignadoRespuestaDto> {
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const referencia = await db.partido.findUnique({
            where: { id },
            select: { temporadaId: true },
          });
          if (!referencia) throw new NotFoundException('El partido no existe.');
          await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
          await db.$queryRaw`SELECT id FROM partido WHERE id=${id} FOR UPDATE`;
          const partido = await db.partido.findUnique({
            where: { id },
            select: { estado: true, inicio: true, fin: true },
          });
          if (!partido) throw new NotFoundException('El partido no existe.');
          if (partido.estado !== 'PROGRAMADO')
            throw new ConflictException(
              'Solo se puede asignar árbitro a un partido Programado.',
            );
          // Mantiene elegible al candidato hasta confirmar, sin cambiar sus datos.
          await db.$queryRaw`SELECT id FROM usuario WHERE id=${arbitroId}::uuid FOR SHARE`;
          const arbitro = await db.user.findUnique({
            where: { id: arbitroId },
            select: { nombre: true, rol: true, isActive: true },
          });
          if (!arbitro) throw new NotFoundException('El árbitro no existe.');
          if (arbitro.rol !== 'ARBITRO' || !arbitro.isActive)
            throw new UnprocessableEntityException(
              'El candidato debe ser un árbitro activo.',
            );
          const ocupado = await db.partido.findFirst({
            where: {
              id: { not: id },
              arbitroId,
              estado: { not: 'CANCELADO' },
              inicio: { lt: partido.fin },
              fin: { gt: partido.inicio },
            },
            select: { id: true },
          });
          if (ocupado)
            throw new ConflictException(
              'Ese árbitro ya tiene un partido en ese horario.',
            );
          // La exclusión de DB-3.1 cierra la carrera entre temporadas diferentes.
          await db.$queryRaw`UPDATE partido SET arbitro_id=${arbitroId}::uuid WHERE id=${id} RETURNING id`;
          return { partidoId: id, arbitroId, arbitroNombre: arbitro.nombre };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      traducirConflictoPartido(error);
    }
  }
}
