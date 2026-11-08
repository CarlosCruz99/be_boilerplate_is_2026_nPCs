import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { TemporadaDto } from '../dto/temporada.dto.js';

@Injectable()
export class TemporadasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(inscripcionAbierta?: boolean): Promise<TemporadaDto[]> {
    const temporadas = await this.prisma.temporada.findMany({
      where: inscripcionAbierta === undefined ? {} : { inscripcionAbierta },
      orderBy: [{ fechaInicio: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        fechaInicio: true,
        fechaFin: true,
        actual: true,
        inscripcionAbierta: true,
      },
    });
    return temporadas.map(({ fechaInicio, fechaFin, ...temporada }) => ({
      ...temporada,
      fechaInicio: fechaInicio.toISOString().slice(0, 10),
      fechaFin: fechaFin.toISOString().slice(0, 10),
    }));
  }
}
