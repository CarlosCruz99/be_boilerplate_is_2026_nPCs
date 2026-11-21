import { Logger } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { ArbitroPartidoService } from '../autorizacion/arbitro-partido.service.js';
import { MarcadorService } from './marcador.service.js';

describe('BE-5.1: revalidación transaccional del marcador', () => {
  const usuario = { id: 'asignado', rol: 'ARBITRO', isActive: true } as const;
  const valores = {
    golesLocal: 2,
    golesVisitante: 1,
    faltasLocal: 4,
    faltasVisitante: 6,
  };
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
  const servicio = new MarcadorService(
    prisma as unknown as PrismaService,
    new ArbitroPartidoService(),
  );
  beforeEach(() => {
    vi.clearAllMocks();
    db.partido.findUnique.mockReset();
    db.partido.findUnique.mockResolvedValueOnce({ temporadaId: 3 });
    db.$queryRaw.mockResolvedValue([{ id: 12 }]);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('deniega si la asignación cambió después del guard, sin guardar ni auditar', async () => {
    db.partido.findUnique.mockResolvedValueOnce({
      id: 12,
      arbitroId: 'nuevo-arbitro',
      estado: 'EN_CURSO',
    });
    await expect(
      servicio.actualizar(12, valores, usuario),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.partido.update).not.toHaveBeenCalled();
    expect(db.bitacoraMarcador.create).not.toHaveBeenCalled();
    expect(db.partido.findUnique.mock.invocationCallOrder[1]).toBeGreaterThan(
      db.$queryRaw.mock.invocationCallOrder[1],
    );
  });

  it('deniega si el partido finalizó mientras esperaba el bloqueo', async () => {
    db.partido.findUnique.mockResolvedValueOnce({
      id: 12,
      arbitroId: usuario.id,
      estado: 'FINALIZADO',
    });
    await expect(
      servicio.actualizar(12, valores, usuario),
    ).rejects.toMatchObject({
      status: 409,
      message:
        'El partido ya está finalizado. Solo procede la corrección autorizada (H23).',
    });
    expect(db.partido.update).not.toHaveBeenCalled();
    expect(db.bitacoraMarcador.create).not.toHaveBeenCalled();
  });

  it('responde 404 si la fila desaparece antes de releerla', async () => {
    db.partido.findUnique.mockResolvedValueOnce(null);
    await expect(
      servicio.actualizar(12, valores, usuario),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.partido.update).not.toHaveBeenCalled();
  });
});
