import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { ReportePagosController } from './reporte-pagos.controller.js';
import { ReportePagosService } from './reporte-pagos.service.js';

describe('H21. Estado de pagos de todos los equipos', () => {
  it('AC3: refleja de inmediato cuotas nuevas del Módulo 6 en cada consulta y deshabilita caché HTTP', async () => {
    const db = {
      temporada: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            equipoId: 10,
            nombre: 'Tigres FC',
            totalCuotas: '100.00',
            pagado: '100.00',
            saldoPendiente: '0.00',
            vencidoDesde: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            equipoId: 10,
            nombre: 'Tigres FC',
            totalCuotas: '125.00',
            pagado: '100.00',
            saldoPendiente: '25.00',
            vencidoDesde: null,
          },
        ]),
    };
    const prisma = {
      $transaction: vi.fn(
        (operacion: (tx: typeof db) => Promise<unknown>) => operacion(db),
      ),
    };
    const servicio = new ReportePagosService(
      prisma as unknown as PrismaService,
    );

    const antes = await servicio.consultar({
      temporadaId: 1,
      concepto: 'TODOS',
    });
    expect(antes.equipos[0]).toMatchObject({
      totalCuotas: '100.00',
      pagado: '100.00',
      saldoPendiente: '0.00',
      estado: 'PAGADO',
    });
    expect(antes.totales.totalCuotas).toBe('100.00');

    const despues = await servicio.consultar({
      temporadaId: 1,
      concepto: 'TODOS',
    });
    expect(despues.equipos[0]).toMatchObject({
      totalCuotas: '125.00',
      pagado: '100.00',
      saldoPendiente: '25.00',
      estado: 'CON_SALDO',
    });
    expect(despues.totales).toMatchObject({
      totalCuotas: '125.00',
      saldoPendiente: '25.00',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    const consultarHandler = (
      Object.getOwnPropertyDescriptor(
        ReportePagosController.prototype,
        'consultar',
      ) as { value: object }
    ).value;
    const headers = Reflect.getMetadata(
      '__headers__',
      consultarHandler,
    ) as Array<{ name: string; value: string }>;
    expect(headers).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'private, no-store' },
      ]),
    );
    expect(Reflect.getMetadata('roles', ReportePagosController)).toEqual([
      'ORGANIZADOR',
    ]);
  });

  it('AC3: lanza 404 si la temporada no existe sin devolver montos ficticios', async () => {
    const db = {
      temporada: { findUnique: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn(),
    };
    const servicio = new ReportePagosService({
      $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
    } as unknown as PrismaService);

    await expect(
      servicio.consultar({ temporadaId: 999, concepto: 'TODOS' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
