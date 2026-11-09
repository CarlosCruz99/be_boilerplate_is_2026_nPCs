import type { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import { AvisosService } from './avisos.service.js';
import type { CrearAvisoDto } from '../avisos.contract.js';

describe('AvisosService', () => {
  function escenario() {
    const user = {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: '00000000-0000-4000-8000-000000000012' }),
    };
    const equipo = {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          capitanId: 'capitan',
          jugadores: [
            { jugador: { usuarioId: 'capitan' } },
            { jugador: { usuarioId: 'jugador' } },
            { jugador: { usuarioId: null } },
          ],
        }),
    };
    const aviso = {
      createManyAndReturn: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };
    const db = { user, equipo, aviso };
    const transaction = vi.fn(
      (operacion: (cliente: typeof db) => Promise<unknown>) => operacion(db),
    );
    const servicio = new AvisosService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { servicio, transaction, db };
  }
  const dto: CrearAvisoDto = {
    moduloOrigen: 'CALENDARIO',
    tipo: 'JORNADA_PUBLICADA',
    destinatario: { usuarioId: '00000000-0000-4000-8000-000000000012' },
    titulo: 'Título',
    mensaje: 'Mensaje',
    claveIdempotencia: 'jornada-1',
  };

  it('resuelve el equipo, deduplica al capitán y omite jugadores sin cuenta', async () => {
    const { servicio, db } = escenario();
    expect(
      await servicio.send({
        ...dto,
        destinatario: { equipoId: 1, temporadaId: 2 },
      }),
    ).toEqual({ avisosCreados: 2, avisoIds: [1, 2] });
    const argumento = db.aviso.createManyAndReturn.mock.calls[0][0] as {
      data: { usuarioId: string }[];
      skipDuplicates: boolean;
    };
    expect(argumento.data.map((a) => a.usuarioId)).toEqual([
      'capitan',
      'jugador',
    ]);
    expect(argumento.skipDuplicates).toBe(true);
  });
  it('admite el cliente transaccional del llamador sin abrir otra transacción', async () => {
    const { servicio, db, transaction } = escenario();
    db.aviso.createManyAndReturn.mockResolvedValue([{ id: 3 }]);
    expect(
      await servicio.send(dto, db as unknown as Prisma.TransactionClient),
    ).toEqual({ avisosCreados: 1, avisoIds: [3] });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('reporta cero cuando la clave ya existe', async () => {
    const { servicio, db } = escenario();
    db.aviso.createManyAndReturn.mockResolvedValue([]);
    expect(await servicio.send(dto)).toEqual({
      avisosCreados: 0,
      avisoIds: [],
    });
  });
  it('propaga el fallo del lote para que la transacción se revierta', async () => {
    const { servicio, db } = escenario();
    db.aviso.createManyAndReturn.mockRejectedValue(new Error('fallo'));
    await expect(servicio.send(dto)).rejects.toThrow('fallo');
  });
  it('no escribe con destinatario inexistente o datos inválidos', async () => {
    const { servicio, db } = escenario();
    db.user.findUnique.mockResolvedValue(null);
    await expect(servicio.send(dto)).rejects.toMatchObject({ status: 404 });
    await expect(servicio.send({ ...dto, titulo: '' })).rejects.toMatchObject({
      status: 400,
    });
    expect(db.aviso.createManyAndReturn).not.toHaveBeenCalled();
  });
});
