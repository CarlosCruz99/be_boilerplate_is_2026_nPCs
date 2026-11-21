import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { CalendarioOrganizadorDto } from '../dto/calendario-organizador.dto.js';

@Injectable()
export class CalendarioOrganizadorService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(temporadaId: number): Promise<CalendarioOrganizadorDto> {
    const temporada = await this.prisma.temporada.findUnique({
      where: { id: temporadaId },
      select: {
        id: true,
        jornadas: {
          orderBy: [{ numero: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            numero: true,
            estado: true,
            publicadaEn: true,
            partidos: {
              // El organizador también ve cancelados y jornadas en borrador.
              orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                equipoLocalId: true,
                equipoVisitanteId: true,
                canchaId: true,
                arbitroId: true,
                inicio: true,
                fin: true,
                estado: true,
                local: { select: { id: true, nombre: true } },
                visitante: { select: { id: true, nombre: true } },
                cancha: { select: { id: true, nombre: true, direccion: true } },
                arbitro: { select: { id: true, nombre: true } },
              },
            },
          },
        },
      },
    });
    if (!temporada) throw new NotFoundException('La temporada no existe.');
    return {
      temporadaId: temporada.id,
      jornadas: temporada.jornadas.map(
        ({ partidos, publicadaEn, ...jornada }) => ({
          ...jornada,
          publicadaEn: publicadaEn?.toISOString() ?? null,
          partidos: partidos.map(({ inicio, fin, ...partido }) => ({
            ...partido,
            jornada: jornada.numero,
            inicio: inicio.toISOString(),
            fin: fin.toISOString(),
          })),
        }),
      ),
    };
  }
}
