import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { EstadisticasPersonalesService } from './estadisticas-personales.service.js';

describe('EstadisticasPersonalesService', () => {
  function escenario() {
    const db = {
      temporada: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
      jugador: {
        findUnique: vi.fn().mockResolvedValue({ id: 10 }),
      },
      equipoJugador: {
        findUnique: vi.fn().mockResolvedValue({
          equipo: { estado: 'INSCRITO' },
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const transaction = vi.fn(
      (operacion: (cliente: typeof db) => Promise<unknown>) => operacion(db),
    );
    const servicio = new EstadisticasPersonalesService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { servicio, db, transaction };
  }

  it('devuelve 404 si la temporada no existe', async () => {
    const { servicio, db } = escenario();
    db.temporada.findUnique.mockResolvedValue(null);
    await expect(servicio.consultar(999, 'u-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('devuelve 403 si la cuenta no tiene ficha vinculada', async () => {
    const { servicio, db } = escenario();
    db.jugador.findUnique.mockResolvedValue(null);
    await expect(servicio.consultar(1, 'u-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('devuelve 403 si el jugador no está inscrito en la temporada', async () => {
    const { servicio, db } = escenario();
    db.equipoJugador.findUnique.mockResolvedValue(null);
    await expect(servicio.consultar(1, 'u-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('devuelve 403 si el equipo está pendiente o rechazado', async () => {
    const { servicio, db } = escenario();
    db.equipoJugador.findUnique.mockResolvedValue({
      equipo: { estado: 'PENDIENTE' },
    });
    await expect(servicio.consultar(1, 'u-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('devuelve ceros y lista vacía cuando no tiene registros oficiales', async () => {
    const { servicio } = escenario();
    await expect(servicio.consultar(1, 'u-1')).resolves.toEqual({
      temporadaId: 1,
      acumulados: { goles: 0, asistencias: 0, tarjetas: 0 },
      partidos: [],
    });
  });

  it('suma acumulados y serializa fechas en orden recibido', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockResolvedValue([
      {
        partidoId: 20,
        fecha: new Date('2026-11-15T18:00:00.000Z'),
        rival: 'Leones FC',
        goles: 2,
        asistencias: 1,
        tarjetas: 0,
      },
      {
        partidoId: 11,
        fecha: new Date('2026-11-08T18:00:00.000Z'),
        rival: 'Águilas FC',
        goles: 1,
        asistencias: 0,
        tarjetas: 2,
      },
    ]);
    await expect(servicio.consultar(1, 'u-1')).resolves.toEqual({
      temporadaId: 1,
      acumulados: { goles: 3, asistencias: 1, tarjetas: 2 },
      partidos: [
        {
          partidoId: 20,
          fecha: '2026-11-15T18:00:00.000Z',
          rival: 'Leones FC',
          goles: 2,
          asistencias: 1,
          tarjetas: 0,
        },
        {
          partidoId: 11,
          fecha: '2026-11-08T18:00:00.000Z',
          rival: 'Águilas FC',
          goles: 1,
          asistencias: 0,
          tarjetas: 2,
        },
      ],
    });
  });

  it('propaga fallos internos sin simular ceros', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockRejectedValue(new Error('fallo de conexión'));
    await expect(servicio.consultar(1, 'u-1')).rejects.toThrow(
      'fallo de conexión',
    );
  });
});
