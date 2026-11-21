import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
  JugadorDestacadoDto,
  JugadoresDestacadosRespuestaDto,
  MetricaDestacados,
} from '../dto/jugadores-destacados.dto.js';

@Injectable()
export class JugadoresDestacadosService {
  constructor(private readonly prisma: PrismaService) {}

  consultar(
    temporadaId: number,
    metrica: MetricaDestacados,
  ): Promise<JugadoresDestacadosRespuestaDto> {
    return this.prisma.$transaction(
      async (db) => {
        const temporada = await db.temporada.findUnique({
          where: { id: temporadaId },
          select: { id: true },
        });
        if (!temporada) {
          throw new NotFoundException('La temporada no existe.');
        }

        // Sigue DB-11.1: parámetro enlazado (sin interpolación) y DENSE_RANK().
        const jugadores = await db.$queryRaw<JugadorDestacadoDto[]>`
          SELECT x.jugador_id AS "jugadorId",
                 j.nombre_completo AS "nombre",
                 x.total::double precision AS total,
                 DENSE_RANK() OVER (ORDER BY x.total DESC)::int AS "posicion"
          FROM (
            SELECT e.jugador_id,
                   SUM(
                     CASE ${metrica}::text
                       WHEN 'goles' THEN e.goles
                       WHEN 'asistencias' THEN e.asistencias
                     END
                   ) AS total
            FROM estadistica_partido e
            JOIN partido p ON p.id = e.partido_id
            JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
            WHERE p.temporada_id = ${temporadaId}
              AND p.estado = 'FINALIZADO'
              AND ${metrica}::text IN ('goles', 'asistencias')
            GROUP BY e.jugador_id
          ) x
          JOIN jugador j ON j.id = x.jugador_id
          ORDER BY x.total DESC, x.jugador_id ASC
        `;

        return { temporadaId, metrica, jugadores };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
