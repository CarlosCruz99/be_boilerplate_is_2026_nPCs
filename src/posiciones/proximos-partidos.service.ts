import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { exigirCapitan, type CapitanActor } from './autorizacion-capitan.js';
import type { ProximosPartidosRespuestaDto } from './proximos-partidos.dto.js';

@Injectable()
export class ProximosPartidosService {
  constructor(private readonly prisma: PrismaService) {}
  consultar(
    equipoId: number,
    usuario: CapitanActor,
  ): Promise<ProximosPartidosRespuestaDto> {
    return this.prisma.$transaction(
      async (db) => {
        const equipo = await db.equipo.findUnique({
          where: { id: equipoId },
          select: { capitanId: true, temporadaId: true, estado: true },
        });
        if (!equipo) throw new NotFoundException('El equipo no existe.');
        exigirCapitan(usuario, equipo.capitanId);
        const temporada = await db.temporada.findFirst({
          where: { actual: true },
          select: { id: true },
        });
        if (!temporada) throw new NotFoundException('No hay temporada actual.');
        if (equipo.estado !== 'INSCRITO' || equipo.temporadaId !== temporada.id)
          throw new ForbiddenException(
            'El equipo debe estar inscrito en la temporada actual.',
          );
        // Una sola referencia de tiempo, independiente de la zona horaria del servidor.
        const ahora = new Date();
        const filas = await db.$queryRaw<
          {
            partidoId: number;
            fechaHora: Date;
            equipoId: number;
            nombre: string;
            lugar: number | null;
            puntos: number | null;
          }[]
        >`
        SELECT p.id AS "partidoId",p.inicio AS "fechaHora",r.id AS "equipoId",r.nombre,v.lugar,v.puntos
        FROM partido p JOIN jornada j ON j.id=p.jornada_id AND j.temporada_id=p.temporada_id
        JOIN equipo r ON r.id=CASE WHEN p.equipo_local_id=${equipoId} THEN p.equipo_visitante_id ELSE p.equipo_local_id END
        LEFT JOIN v_tabla_posiciones v ON v.equipo_id=r.id AND v.temporada_id=p.temporada_id
        WHERE p.temporada_id=${temporada.id} AND p.estado='PROGRAMADO' AND j.estado='PUBLICADA'
          AND p.inicio>=${ahora} AND (p.equipo_local_id=${equipoId} OR p.equipo_visitante_id=${equipoId})
        ORDER BY p.inicio,p.id`;
        return {
          equipoId,
          proximos: filas.map((f) => ({
            partidoId: f.partidoId,
            fechaHora: f.fechaHora.toISOString(),
            rival: {
              equipoId: f.equipoId,
              nombre: f.nombre,
              lugar: f.lugar,
              puntos: f.puntos,
            },
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
