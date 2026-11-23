import type { Prisma } from '@PrismaClient';
import { PosicionesService } from './posiciones.service.js';

interface PartidoSimulado {
  temporadaId: number;
  estado: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
  equipoLocalId: number;
  equipoVisitanteId: number;
  golesLocal: number | null;
  golesVisitante: number | null;
}

describe('H08. Actualización de las posiciones automáticamente', () => {
  const servicio = new PosicionesService();

  it('AC3: excluye partidos de otras temporadas y partidos no finalizados al recalcular la tabla', async () => {
    const equiposTabla = [
      { id: 1, temporadaId: 1 },
      { id: 2, temporadaId: 1 },
      { id: 3, temporadaId: 2 },
    ];
    const partidosTabla: PartidoSimulado[] = [
      {
        temporadaId: 1,
        estado: 'FINALIZADO',
        equipoLocalId: 1,
        equipoVisitanteId: 2,
        golesLocal: 3,
        golesVisitante: 1,
      },
      {
        temporadaId: 1,
        estado: 'EN_CURSO',
        equipoLocalId: 2,
        equipoVisitanteId: 1,
        golesLocal: 5,
        golesVisitante: 0,
      },
      {
        temporadaId: 2,
        estado: 'FINALIZADO',
        equipoLocalId: 2,
        equipoVisitanteId: 1,
        golesLocal: 9,
        golesVisitante: 0,
      },
    ];

    const equipoFindMany = vi.fn(
      ({ where }: { where: { temporadaId: number } }) =>
        Promise.resolve(
          equiposTabla
            .filter((e) => e.temporadaId === where.temporadaId)
            .map(({ id }) => ({ id })),
        ),
    );
    const partidoFindMany = vi.fn(
      ({ where }: { where: { temporadaId: number; estado: string } }) =>
        Promise.resolve(
          partidosTabla.filter(
            (p) =>
              p.temporadaId === where.temporadaId && p.estado === where.estado,
          ),
        ),
    );
    const queryRaw = vi.fn().mockResolvedValue([]);
    const executeRaw = vi.fn().mockResolvedValue(2);

    const tx = {
      $queryRaw: queryRaw,
      equipo: { findMany: equipoFindMany },
      partido: { findMany: partidoFindMany },
      $executeRaw: executeRaw,
    };

    await servicio.recalcular(1, tx as unknown as Prisma.TransactionClient);

    expect(equipoFindMany).toHaveBeenCalledWith({
      where: { temporadaId: 1 },
      select: { id: true },
    });
    expect(partidoFindMany).toHaveBeenCalledWith({
      where: { temporadaId: 1, estado: 'FINALIZADO' },
      select: {
        equipoLocalId: true,
        equipoVisitanteId: true,
        golesLocal: true,
        golesVisitante: true,
      },
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const llamada = executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      number,
      string,
    ];
    expect(llamada[1]).toBe(1);
    const filas = JSON.parse(llamada[2]) as Array<{
      equipoId: number;
      pj: number;
      pg: number;
      pp: number;
      gf: number;
      gc: number;
      puntos: number;
    }>;
    expect(filas).toEqual([
      {
        equipoId: 1,
        pj: 1,
        pg: 1,
        pe: 0,
        pp: 0,
        gf: 3,
        gc: 1,
        dg: 2,
        puntos: 3,
      },
      {
        equipoId: 2,
        pj: 1,
        pg: 0,
        pe: 0,
        pp: 1,
        gf: 1,
        gc: 3,
        dg: -2,
        puntos: 0,
      },
    ]);
  });

  it('AC3: no ejecuta cálculo si la temporada no tiene equipos registrados', async () => {
    const equipoFindMany = vi.fn().mockResolvedValue([]);
    const partidoFindMany = vi.fn();
    const executeRaw = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      equipo: { findMany: equipoFindMany },
      partido: { findMany: partidoFindMany },
      $executeRaw: executeRaw,
    };

    await servicio.recalcular(99, tx as unknown as Prisma.TransactionClient);

    expect(partidoFindMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
