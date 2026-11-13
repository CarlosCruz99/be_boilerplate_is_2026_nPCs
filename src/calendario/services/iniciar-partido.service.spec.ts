import { Logger } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { ArbitroPartidoService } from '../autorizacion/arbitro-partido.service.js';
import { IniciarPartidoService } from './iniciar-partido.service.js';

describe('BE-5.4: validación del inicio después del bloqueo', () => {
  const usuario = { id: 'asignado', rol: 'ARBITRO', isActive: true } as const;
  const db = {
    $queryRaw: vi.fn(),
    partido: { findUnique: vi.fn(), update: vi.fn() },
    bitacoraMarcador: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (trabajo: (tx: typeof db) => Promise<unknown>) =>
      trabajo(db),
    ),
  };
  const servicio = new IniciarPartidoService(
    prisma as unknown as PrismaService,
    new ArbitroPartidoService(),
  );
  beforeEach(() => {
    vi.clearAllMocks();
    db.partido.findUnique.mockReset();
    db.partido.findUnique.mockResolvedValueOnce({ temporadaId: 3 });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['EN_CURSO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza %s sin escribir',
    async (estado) => {
      db.partido.findUnique.mockResolvedValueOnce({
        id: 12,
        arbitroId: usuario.id,
        estado,
      });
      await expect(servicio.iniciar(12, usuario)).rejects.toMatchObject({
        status: 409,
      });
      expect(db.partido.update).not.toHaveBeenCalled();
      expect(db.bitacoraMarcador.create).not.toHaveBeenCalled();
      expect(db.partido.findUnique.mock.invocationCallOrder[1]).toBeGreaterThan(
        db.$queryRaw.mock.invocationCallOrder[1],
      );
    },
  );
  it('rechaza una asignación que cambió después del guard', async () => {
    db.partido.findUnique.mockResolvedValueOnce({
      id: 12,
      arbitroId: 'nuevo',
      estado: 'PROGRAMADO',
    });
    await expect(servicio.iniciar(12, usuario)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.partido.update).not.toHaveBeenCalled();
    expect(db.bitacoraMarcador.create).not.toHaveBeenCalled();
  });
  it('responde 404 si el partido desapareció antes de releerlo', async () => {
    db.partido.findUnique.mockResolvedValueOnce(null);
    await expect(servicio.iniciar(12, usuario)).rejects.toMatchObject({
      status: 404,
    });
    expect(db.partido.update).not.toHaveBeenCalled();
  });
});
