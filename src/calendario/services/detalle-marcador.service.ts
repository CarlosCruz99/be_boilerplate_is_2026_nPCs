import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import type {
  DetalleMarcadorRespuestaDto,
  GoleadorMarcadorDto,
} from '../dto/detalle-marcador.dto.js';
import { duracionPartido } from '../utils/duracion-partido.js';

@Injectable()
export class DetalleMarcadorService {
  constructor(private readonly prisma: PrismaService) {}
  consultar(
    partidoId: number,
    usuario?: Pick<User, 'rol' | 'isActive'>,
  ): Promise<DetalleMarcadorRespuestaDto> {
    return this.prisma.$transaction(
      async (db) => {
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: {
            id: true,
            estado: true,
            temporadaId: true,
            equipoLocalId: true,
            equipoVisitanteId: true,
            golesLocal: true,
            golesVisitante: true,
            faltasLocal: true,
            faltasVisitante: true,
            inicioReal: true,
            finReal: true,
            jornada: { select: { estado: true } },
            local: { select: { nombre: true } },
            visitante: { select: { nombre: true } },
            participaciones: {
              select: {
                jugadorId: true,
                equipoId: true,
                equipoJugador: {
                  select: { jugador: { select: { nombreCompleto: true } } },
                },
              },
              orderBy: { jugadorId: 'asc' },
            },
          },
        });
        const organizador = usuario?.rol === 'ORGANIZADOR' && usuario.isActive;
        if (
          !partido ||
          (partido.jornada.estado !== 'PUBLICADA' && !organizador)
        )
          throw new NotFoundException('El partido no existe.');
        if (partido.estado === 'PROGRAMADO')
          throw new ConflictException('Este partido aún no comienza.');
        if (partido.estado === 'CANCELADO')
          throw new ConflictException('Este partido fue cancelado.');
        // H9 es independiente de participación: retirar un participante no borra sus goles.
        const goleadores = await db.$queryRaw<GoleadorMarcadorDto[]>`
        SELECT e.jugador_id AS "jugadorId",j.nombre_completo AS nombre,ej.equipo_id AS "equipoId",e.goles
        FROM estadistica_partido e JOIN jugador j ON j.id=e.jugador_id
        JOIN equipo_jugador ej ON ej.jugador_id=e.jugador_id AND ej.temporada_id=${partido.temporadaId}
        WHERE e.partido_id=${partidoId} AND e.goles>0 AND ej.equipo_id IN (${partido.equipoLocalId},${partido.equipoVisitanteId})
        ORDER BY e.goles DESC,j.nombre_completo,j.id`;
        const jugadores = (equipoId: number) =>
          partido.participaciones
            .filter((p) => p.equipoId === equipoId)
            .map((p) => ({
              id: p.jugadorId,
              nombre: p.equipoJugador.jugador.nombreCompleto,
            }));
        return {
          partidoId,
          estado: partido.estado,
          local: {
            equipoId: partido.equipoLocalId,
            nombre: partido.local.nombre,
            goles: partido.golesLocal,
            faltas: partido.faltasLocal,
            jugadores: jugadores(partido.equipoLocalId),
          },
          visitante: {
            equipoId: partido.equipoVisitanteId,
            nombre: partido.visitante.nombre,
            goles: partido.golesVisitante,
            faltas: partido.faltasVisitante,
            jugadores: jugadores(partido.equipoVisitanteId),
          },
          goleadores,
          duracionMinutos: duracionPartido(
            partido.inicioReal!,
            partido.estado === 'FINALIZADO' ? partido.finReal! : null,
          ),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
