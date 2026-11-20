import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { ReporteDeportivoService } from './reporte-deportivo.service.js';

describe('ReporteDeportivoService', () => {
  function escenario() {
    const db = {
      temporada: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          totalPartidos: 0,
          totalGoles: 0,
          totalTarjetas: 0,
          totalAsistencias: 0,
        },
      ]),
    };
    const transaction = vi.fn(
      (operacion: (cliente: typeof db) => Promise<unknown>) => operacion(db),
    );
    const servicio = new ReporteDeportivoService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { servicio, db, transaction };
  }

  it('devuelve 404 si la temporada no existe', async () => {
    const { servicio, db } = escenario();
    db.temporada.findUnique.mockResolvedValue(null);

    await expect(servicio.consultar(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('devuelve cuatro ceros e ISO 8601 en temporada válida sin partidos finalizados', async () => {
    const { servicio, transaction } = escenario();

    const reporte = await servicio.consultar(1);

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(reporte).toEqual({
      temporadaId: 1,
      totalPartidos: 0,
      totalGoles: 0,
      totalTarjetas: 0,
      totalAsistencias: 0,
      generadoEn: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(reporte.generadoEn))).toBe(false);
    expect(reporte.generadoEn).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('retorna los indicadores agregados de DB-22.1 sin consultar columnas inexistentes', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockResolvedValue([
      {
        totalPartidos: 2,
        totalGoles: 3,
        totalTarjetas: 4,
        totalAsistencias: 3,
      },
    ]);

    const reporte = await servicio.consultar(5);

    expect(reporte).toMatchObject({
      temporadaId: 5,
      totalPartidos: 2,
      totalGoles: 3,
      totalTarjetas: 4,
      totalAsistencias: 3,
    });
    const [sqlStrings] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    const consulta = sqlStrings.join(' ');
    expect(consulta).toContain("estado = 'FINALIZADO'");
    expect(consulta).not.toContain('resultado_oficial');
    expect(consulta).not.toContain('es_oficial');
  });

  it('rechaza con error interno si la consulta no devuelve fila en vez de simular ceros', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockResolvedValue([]);

    await expect(servicio.consultar(1)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('propaga fallos internos de base de datos sin devolver cifras simuladas', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockRejectedValue(new Error('fallo SQL'));

    await expect(servicio.consultar(1)).rejects.toThrow('fallo SQL');
  });
});
