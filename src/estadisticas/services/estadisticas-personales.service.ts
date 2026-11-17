import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
  MisEstadisticasDto,
  PartidoEstadisticaPersonalDto,
} from '../dto/estadisticas-personales.dto.js';

interface FilaEstadisticaPersonal {
  partidoId: number;
  fecha: Date | string;
  rival: string;
  goles: number;
  asistencias: number;
  tarjetas: number;
}

@Injectable()
export class EstadisticasPersonalesService {
  constructor(private readonly prisma: PrismaService) {}

  consultar(
    temporadaId: number,
    usuarioId: string,
  ): Promise<MisEstadisticasDto> {
    return this.prisma.$transaction(
      async (db) => {
        const temporada = await db.temporada.findUnique({
          where: { id: temporadaId },
          select: { id: true },
        });
        if (!temporada) {
          throw new NotFoundException('La temporada no existe.');
        }

        const jugador = await db.jugador.findUnique({
          where: { usuarioId },
          select: { id: true },
        });
        if (!jugador) {
          throw new ForbiddenException(
            'No tienes una ficha de jugador vinculada.',
          );
        }

        const inscripcion = await db.equipoJugador.findUnique({
          where: {
            temporadaId_jugadorId: { temporadaId, jugadorId: jugador.id },
          },
          select: {
            equipo: { select: { estado: true } },
          },
        });
        if (!inscripcion) {
          throw new ForbiddenException('No estás inscrito en esta temporada.');
        }
        if (inscripcion.equipo.estado !== 'INSCRITO') {
          throw new ForbiddenException(
            'Tu equipo no está inscrito en esta temporada.',
          );
        }

        // Sigue DB-10.1: índice ix_estadistica_jugador y orden cronológico descendente.
        const filas = await db.$queryRaw<FilaEstadisticaPersonal[]>`
          SELECT p.id AS "partidoId",
                 p.inicio AS "fecha",
                 rival.nombre AS "rival",
                 e.goles,
                 e.asistencias,
                 e.tarjetas
          FROM estadistica_partido e
          JOIN partido p ON p.id = e.partido_id
          JOIN equipo_jugador ej ON ej.jugador_id = e.jugador_id AND ej.temporada_id = p.temporada_id
          JOIN equipo rival ON rival.id = CASE
            WHEN ej.equipo_id = p.equipo_local_id THEN p.equipo_visitante_id
            ELSE p.equipo_local_id
          END
          WHERE e.jugador_id = ${jugador.id}
            AND p.temporada_id = ${temporadaId}
            AND p.estado = 'FINALIZADO'
          ORDER BY p.inicio DESC, p.id DESC
        `;

        const acumulados = { goles: 0, asistencias: 0, tarjetas: 0 };
        const partidos: PartidoEstadisticaPersonalDto[] = filas.map((fila) => {
          acumulados.goles += fila.goles;
          acumulados.asistencias += fila.asistencias;
          acumulados.tarjetas += fila.tarjetas;
          return {
            partidoId: fila.partidoId,
            fecha:
              fila.fecha instanceof Date
                ? fila.fecha.toISOString()
                : new Date(fila.fecha).toISOString(),
            rival: fila.rival,
            goles: fila.goles,
            asistencias: fila.asistencias,
            tarjetas: fila.tarjetas,
          };
        });

        return { temporadaId, acumulados, partidos };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
