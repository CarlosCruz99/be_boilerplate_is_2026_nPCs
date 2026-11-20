import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { ReporteDeportivoDto } from './reporte-deportivo.dto.js';

type IndicadoresDeportivosRow = {
  totalPartidos: number;
  totalGoles: number;
  totalTarjetas: number;
  totalAsistencias: number;
};

@Injectable()
export class ReporteDeportivoService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(temporadaId: number): Promise<ReporteDeportivoDto> {
    const fila = await this.prisma.$transaction(
      async (db) => {
        const temporada = await db.temporada.findUnique({
          where: { id: temporadaId },
          select: { id: true },
        });
        if (!temporada) {
          throw new NotFoundException('La temporada no existe.');
        }

        // Sigue DB-22.1: un único SELECT sobre FINALIZADO en la misma instantánea.
        const filas = await db.$queryRaw<IndicadoresDeportivosRow[]>`
          WITH oficial AS (
            SELECT id, goles_local, goles_visitante
            FROM partido
            WHERE temporada_id = ${temporadaId} AND estado = 'FINALIZADO'
          )
          SELECT (SELECT COUNT(*) FROM oficial)::int AS "totalPartidos",
                 (SELECT COALESCE(SUM(goles_local + goles_visitante), 0) FROM oficial)::int AS "totalGoles",
                 (SELECT COALESCE(SUM(e.tarjetas), 0) FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int AS "totalTarjetas",
                 (SELECT COALESCE(SUM(e.asistencias), 0) FROM estadistica_partido e JOIN oficial o ON o.id = e.partido_id)::int AS "totalAsistencias"
        `;

        const indicadores = filas[0];
        if (!indicadores) {
          throw new InternalServerErrorException(
            'No fue posible obtener el reporte deportivo de la temporada.',
          );
        }
        return indicadores;
      },
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      temporadaId,
      totalPartidos: fila.totalPartidos,
      totalGoles: fila.totalGoles,
      totalTarjetas: fila.totalTarjetas,
      totalAsistencias: fila.totalAsistencias,
      generadoEn: new Date().toISOString(),
    };
  }
}
