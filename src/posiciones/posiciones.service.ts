import { Injectable } from '@nestjs/common';
import type { Prisma } from '@PrismaClient';
import { calcularPosiciones } from './calcular-posiciones.js';

@Injectable()
export class PosicionesService {
  /**
   * Comparte la transacción ReadCommitted del flujo que escribe el resultado.
   * Ese flujo debe bloquear la temporada antes del partido para respetar el
   * orden de bloqueo del calendario. Aquí se serializan los recálculos.
   */
  async recalcular(
    temporadaId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM temporada WHERE id = ${temporadaId} FOR NO KEY UPDATE`;
    const equipos = await tx.equipo.findMany({
      where: { temporadaId },
      select: { id: true },
    });
    if (equipos.length === 0) return;

    const partidos = await tx.partido.findMany({
      where: { temporadaId, estado: 'FINALIZADO' },
      select: {
        equipoLocalId: true,
        equipoVisitanteId: true,
        golesLocal: true,
        golesVisitante: true,
      },
    });
    const tabla = calcularPosiciones(
      equipos.map(({ id }) => id),
      partidos,
    );
    await tx.$executeRaw`
      INSERT INTO posicion (temporada_id, equipo_id, pj, pg, pe, pp, gf, gc, dg, puntos)
      SELECT ${temporadaId}, "equipoId", pj, pg, pe, pp, gf, gc, dg, puntos
      FROM jsonb_to_recordset(${JSON.stringify(tabla)}::jsonb)
        AS fila("equipoId" int, pj int, pg int, pe int, pp int, gf int, gc int, dg int, puntos int)
      ON CONFLICT (temporada_id, equipo_id) DO UPDATE
      SET pj = EXCLUDED.pj, pg = EXCLUDED.pg, pe = EXCLUDED.pe, pp = EXCLUDED.pp,
          gf = EXCLUDED.gf, gc = EXCLUDED.gc, dg = EXCLUDED.dg, puntos = EXCLUDED.puntos
      WHERE (posicion.pj, posicion.pg, posicion.pe, posicion.pp, posicion.gf,
             posicion.gc, posicion.dg, posicion.puntos)
        IS DISTINCT FROM
            (EXCLUDED.pj, EXCLUDED.pg, EXCLUDED.pe, EXCLUDED.pp, EXCLUDED.gf,
             EXCLUDED.gc, EXCLUDED.dg, EXCLUDED.puntos)
    `;
  }
}
