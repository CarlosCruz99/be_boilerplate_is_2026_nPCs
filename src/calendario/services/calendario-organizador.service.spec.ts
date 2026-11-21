import type { PrismaService } from '@Prisma/services';
import { CalendarioOrganizadorService } from './calendario-organizador.service.js';

describe('CalendarioOrganizadorService', () => {
  const prisma = { temporada: { findUnique: vi.fn() } };
  const servicio = new CalendarioOrganizadorService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => vi.resetAllMocks());
  it('distingue una temporada inexistente de una sin jornadas', async () => {
    prisma.temporada.findUnique.mockResolvedValueOnce(null);
    await expect(servicio.consultar(8)).rejects.toMatchObject({ status: 404 });
    prisma.temporada.findUnique.mockResolvedValueOnce({ id: 8, jornadas: [] });
    await expect(servicio.consultar(8)).resolves.toEqual({
      temporadaId: 8,
      jornadas: [],
    });
  });
  it('devuelve ids de jornadas, publicación y partidos cancelados con fechas ISO', async () => {
    const inicio = new Date('2035-02-10T14:00:00Z');
    prisma.temporada.findUnique.mockResolvedValue({
      id: 8,
      jornadas: [
        {
          id: 91,
          numero: 3,
          estado: 'PUBLICADA',
          publicadaEn: inicio,
          partidos: [
            {
              id: 70,
              estado: 'CANCELADO',
              inicio,
              fin: new Date('2035-02-10T15:30:00Z'),
              local: { id: 1, nombre: 'Local' },
            },
          ],
        },
      ],
    });
    await expect(servicio.consultar(8)).resolves.toMatchObject({
      jornadas: [
        {
          id: 91,
          numero: 3,
          estado: 'PUBLICADA',
          publicadaEn: inicio.toISOString(),
          partidos: [
            { jornada: 3, estado: 'CANCELADO', inicio: inicio.toISOString() },
          ],
        },
      ],
    });
  });
});
