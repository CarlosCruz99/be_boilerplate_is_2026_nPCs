import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { JugadoresDestacadosService } from './jugadores-destacados.service.js';

describe('JugadoresDestacadosService', () => {
  function escenario() {
    const db = {
      temporada: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const transaction = vi.fn(
      (operacion: (cliente: typeof db) => Promise<unknown>) => operacion(db),
    );
    const servicio = new JugadoresDestacadosService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { servicio, db };
  }

  it('devuelve 404 si la temporada no existe', async () => {
    const { servicio, db } = escenario();
    db.temporada.findUnique.mockResolvedValue(null);
    await expect(servicio.consultar(999, 'goles')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('devuelve lista vacía cuando no hay registros oficiales', async () => {
    const { servicio } = escenario();
    await expect(servicio.consultar(1, 'goles')).resolves.toEqual({
      temporadaId: 1,
      metrica: 'goles',
      jugadores: [],
    });
  });

  it('devuelve la clasificación obtenida con posiciones densas', async () => {
    const { servicio, db } = escenario();
    const filas = [
      { jugadorId: 1, nombre: 'Ana López', total: 5, posicion: 1 },
      { jugadorId: 2, nombre: 'Luis Pérez', total: 3, posicion: 2 },
      { jugadorId: 3, nombre: 'Mario Ruiz', total: 3, posicion: 2 },
      { jugadorId: 4, nombre: 'Sofía Díaz', total: 1, posicion: 3 },
    ];
    db.$queryRaw.mockResolvedValue(filas);
    await expect(servicio.consultar(2, 'asistencias')).resolves.toEqual({
      temporadaId: 2,
      metrica: 'asistencias',
      jugadores: filas,
    });
  });

  it('propaga fallos internos sin simular datos', async () => {
    const { servicio, db } = escenario();
    db.$queryRaw.mockRejectedValue(new Error('fallo SQL'));
    await expect(servicio.consultar(1, 'goles')).rejects.toThrow('fallo SQL');
  });
});
