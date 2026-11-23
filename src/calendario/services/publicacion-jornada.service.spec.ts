import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import type { AvisosService } from '../../avisos/services/avisos.service.js';
import type { AvisosCambioPartidoService } from './avisos-cambio-partido.service.js';
import { GeneracionCalendarioService } from './generacion-calendario.service.js';
import { PartidosService } from './partidos.service.js';
import { PublicacionJornadaService } from './publicacion-jornada.service.js';

describe('H16. Notificación sobre la publicación de calendario', () => {
  it('AC5: guardar o generar jornadas en borrador sin publicarlas no emite ningún aviso', async () => {
    const dbGeneracion = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ maxEquipos: 4 }])
        .mockResolvedValue([{ id: 1 }]),
      partido: { count: vi.fn().mockResolvedValue(0) },
      jornada: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 11 }),
      },
      equipo: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]),
      },
      cancha: { findMany: vi.fn().mockResolvedValue([{ id: 1, activa: true }]) },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000001',
            rol: 'ARBITRO',
            isActive: true,
          },
        ]),
      },
    };
    const generacion = new GeneracionCalendarioService({
      $transaction: vi.fn((fn: (tx: typeof dbGeneracion) => Promise<unknown>) =>
        fn(dbGeneracion),
      ),
    } as unknown as PrismaService);

    const generado = await generacion.generar(1, {
      fechaPrimeraJornada: '2099-05-01',
      horaPrimerTurno: '09:00',
      canchaIds: [1],
    });
    expect(generado.estadoJornadas).toBe('BORRADOR');
    expect(dbGeneracion.jornada.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'BORRADOR' }),
      }),
    );

    const avisosCambio = {
      registrar: vi.fn(),
      enviar: vi.fn(),
    };
    const dbPartido = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([{ id: 88 }]),
      equipo: {
        findMany: vi.fn().mockResolvedValue([
          { id: 10, nombre: 'Tigres', temporadaId: 1, estado: 'INSCRITO' },
          { id: 20, nombre: 'Leones', temporadaId: 1, estado: 'INSCRITO' },
        ]),
      },
      cancha: { findUnique: vi.fn().mockResolvedValue({ activa: true }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ rol: 'ARBITRO', isActive: true }),
      },
      jornada: { upsert: vi.fn().mockResolvedValue({ id: 11 }) },
      partido: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 88,
          equipoLocalId: 10,
          equipoVisitanteId: 20,
          canchaId: 1,
          arbitroId: '00000000-0000-4000-8000-000000000001',
          estado: 'PROGRAMADO',
          jornada: { numero: 1, estado: 'BORRADOR' },
          inicio: new Date('2099-05-01T15:00:00.000Z'),
          fin: new Date('2099-05-01T16:30:00.000Z'),
        }),
      },
    };
    const partidos = new PartidosService(
      {
        $transaction: vi.fn((fn: (tx: typeof dbPartido) => Promise<unknown>) =>
          fn(dbPartido),
        ),
      } as unknown as PrismaService,
      avisosCambio as unknown as AvisosCambioPartidoService,
    );

    const partido = await partidos.crear({
      temporadaId: 1,
      jornada: 1,
      equipoLocalId: 10,
      equipoVisitanteId: 20,
      canchaId: 1,
      arbitroId: '00000000-0000-4000-8000-000000000001',
      inicio: '2099-05-01T15:00:00.000Z',
    });
    expect(partido.id).toBe(88);
    expect(avisosCambio.registrar).not.toHaveBeenCalled();
    expect(avisosCambio.enviar).not.toHaveBeenCalled();
  });

  it('solo publica y envía avisos cuando se invoca publicar() sobre una jornada en BORRADOR con partidos activos', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      jornada: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ temporadaId: 1 })
          .mockResolvedValueOnce({ id: 11, numero: 1, estado: 'BORRADOR' }),
        update: vi.fn().mockResolvedValue({ id: 11 }),
      },
      partido: {
        findMany: vi.fn().mockResolvedValue([
          {
            inicio: new Date('2099-05-01T15:00:00.000Z'),
            cancha: { nombre: 'Cancha Norte' },
            local: { nombre: 'Tigres', capitanId: 'cap-1' },
            visitante: { nombre: 'Leones', capitanId: 'cap-2' },
          },
        ]),
      },
    };
    const avisos = { send: vi.fn().mockResolvedValue({ avisosCreados: 1 }) };
    const servicio = new PublicacionJornadaService(
      {
        $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
      } as unknown as PrismaService,
      avisos as unknown as AvisosService,
    );

    const res = await servicio.publicar(11, 'org-1');
    expect(res.estado).toBe('PUBLICADA');
    expect(avisos.send).toHaveBeenCalledTimes(2);

    db.jornada.findUnique
      .mockResolvedValueOnce({ temporadaId: 1 })
      .mockResolvedValueOnce({ id: 11, numero: 1, estado: 'PUBLICADA' });
    await expect(servicio.publicar(11, 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    db.jornada.findUnique
      .mockResolvedValueOnce({ temporadaId: 1 })
      .mockResolvedValueOnce({ id: 12, numero: 2, estado: 'BORRADOR' });
    db.partido.findMany.mockResolvedValueOnce([]);
    await expect(servicio.publicar(12, 'org-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
