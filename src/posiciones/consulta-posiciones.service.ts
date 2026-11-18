import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
  PosicionEquipoDto,
  TablaPosicionesDto,
} from './tabla-posiciones.dto.js';

export interface FilaPosicion {
  lugar: number;
  equipo_id: number;
  nombre: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  puntos: number;
}
export function mapearPosicion(fila: FilaPosicion): PosicionEquipoDto {
  return {
    lugar: fila.lugar,
    equipoId: fila.equipo_id,
    equipo: fila.nombre,
    pj: fila.pj,
    pg: fila.pg,
    pe: fila.pe,
    pp: fila.pp,
    gf: fila.gf,
    gc: fila.gc,
    dg: fila.dg,
    puntos: fila.puntos,
  };
}

@Injectable()
export class ConsultaPosicionesService {
  constructor(private readonly prisma: PrismaService) {}
  listar(): Promise<TablaPosicionesDto> {
    return this.prisma.$transaction(
      async (db) => {
        const temporada = await db.temporada.findFirst({
          where: { actual: true },
          select: { id: true },
        });
        if (!temporada) throw new NotFoundException('No hay temporada actual.');
        // La vista ya asignó los lugares. La temporada y las filas comparten snapshot.
        const filas = await db.$queryRaw<FilaPosicion[]>`
        SELECT lugar,equipo_id,nombre,pj,pg,pe,pp,gf,gc,dg,puntos
        FROM v_tabla_posiciones WHERE temporada_id=${temporada.id} ORDER BY lugar`;
        return {
          temporadaId: temporada.id,
          posiciones: filas.map(mapearPosicion),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async equipo(equipoId: number): Promise<PosicionEquipoDto> {
    // El filtro se aplica fuera de la vista: no recalcula el ranking del equipo.
    const [fila] = await this.prisma.$queryRaw<FilaPosicion[]>`
      SELECT lugar,equipo_id,nombre,pj,pg,pe,pp,gf,gc,dg,puntos
      FROM v_tabla_posiciones WHERE equipo_id=${equipoId}`;
    if (!fila)
      throw new NotFoundException(
        'El equipo no existe o no tiene posición en la temporada actual.',
      );
    return mapearPosicion(fila);
  }
}
