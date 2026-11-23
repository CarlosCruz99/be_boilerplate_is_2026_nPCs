import type { PrismaService } from '@Prisma/services';
import type { AvisosService } from '../../avisos/services/avisos.service.js';
import { AvisosCambioPartidoService } from './avisos-cambio-partido.service.js';
import { PartidosService } from './partidos.service.js';

function crearEscenario(jornadaEstado: 'PUBLICADA' | 'BORRADOR' = 'PUBLICADA') {
  const inicioAnterior = new Date('2099-05-10T16:00:00.000Z');
  const finAnterior = new Date('2099-05-10T17:30:00.000Z');
  const baseAnterior = {
    id: 42,
    equipoLocalId: 10,
    equipoVisitanteId: 20,
    canchaId: 3,
    arbitroId: '00000000-0000-4000-8000-000000000001',
    inicio: inicioAnterior,
    fin: finAnterior,
    estado: 'PROGRAMADO' as const,
    jornada: { numero: 2, estado: jornadaEstado },
    cancha: { nombre: 'Cancha Norte' },
    local: { nombre: 'Tigres' },
    visitante: { nombre: 'Leones' },
  };

  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 42 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    partido: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ temporadaId: 1 })
        .mockResolvedValueOnce(baseAnterior),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(baseAnterior),
      update: vi.fn(),
    },
    equipo: {
      findMany: vi.fn().mockResolvedValue([
        { id: 10, nombre: 'Tigres', temporadaId: 1, estado: 'INSCRITO' },
        { id: 20, nombre: 'Leones', temporadaId: 1, estado: 'INSCRITO' },
      ]),
    },
    cancha: {
      findUnique: vi.fn().mockResolvedValue({ activa: true }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ rol: 'ARBITRO', isActive: true }),
    },
    cambioPartido: {
      createManyAndReturn: vi.fn().mockResolvedValue([{ id: 700 }]),
    },
  };

  const prisma = {
    $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const avisos = {
    send: vi.fn().mockResolvedValue({ avisosCreados: 4, avisoIds: [1, 2, 3, 4] }),
  };
  const avisosCambio = new AvisosCambioPartidoService(
    prisma as unknown as PrismaService,
    avisos as unknown as AvisosService,
  );
  const partidos = new PartidosService(
    prisma as unknown as PrismaService,
    avisosCambio,
  );
  return { partidos, db, avisos, baseAnterior };
}

describe('H15. Notificación sobre cambios en los partidos', () => {
  it('AC1 y AC4: al cambiar fecha, hora o cancha en una jornada publicada envía avisos solo a los dos equipos participantes', async () => {
    const { partidos, db, avisos, baseAnterior } = crearEscenario('PUBLICADA');
    const nuevoInicio = new Date('2099-05-11T19:00:00.000Z');
    db.partido.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseAnterior,
      canchaId: 4,
      inicio: nuevoInicio,
      fin: new Date(nuevoInicio.getTime() + 90 * 60_000),
      cancha: { nombre: 'Cancha Sur' },
    });

    await partidos.editar(
      42,
      {
        inicio: '2099-05-11T19:00:00.000Z',
        canchaId: 4,
      },
      'org-1',
    );

    expect(db.cambioPartido.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(avisos.send).toHaveBeenCalledTimes(2);
    const destinos = avisos.send.mock.calls.map(
      (call) => (call[0] as { destinatario: { equipoId: number } }).destinatario,
    );
    expect(destinos).toEqual([
      { equipoId: 10, temporadaId: 1 },
      { equipoId: 20, temporadaId: 1 },
    ]);
  });

  it('AC2: el aviso incluye ambos equipos, valor anterior/nuevo de fecha, hora y cancha, y referencia al partido', async () => {
    const { partidos, db, avisos, baseAnterior } = crearEscenario('PUBLICADA');
    const nuevoInicio = new Date('2099-05-12T21:00:00.000Z');
    db.partido.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseAnterior,
      canchaId: 5,
      inicio: nuevoInicio,
      fin: new Date(nuevoInicio.getTime() + 90 * 60_000),
      cancha: { nombre: 'Cancha Central' },
    });

    await partidos.editar(
      42,
      {
        inicio: '2099-05-12T21:00:00.000Z',
        canchaId: 5,
      },
      'org-1',
    );

    const payload = avisos.send.mock.calls[0][0] as {
      referencia: { tipo: string; id: number };
      mensaje: string;
      datos: {
        equipoLocal: string;
        equipoVisitante: string;
        cambios: Array<{
          campoModificado: string;
          valorAnterior: string;
          valorNuevo: string;
        }>;
      };
    };
    expect(payload.referencia).toEqual({ tipo: 'PARTIDO', id: 42 });
    expect(payload.datos.equipoLocal).toBe('Tigres');
    expect(payload.datos.equipoVisitante).toBe('Leones');
    expect(payload.mensaje).toContain('Tigres vs. Leones');
    expect(payload.datos.cambios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campoModificado: 'FECHA' }),
        expect.objectContaining({ campoModificado: 'HORA' }),
        {
          campoModificado: 'CANCHA',
          valorAnterior: 'Cancha Norte',
          valorNuevo: 'Cancha Central',
        },
      ]),
    );
  });

  it('AC5: modificar un dato distinto de fecha, hora o cancha (p. ej. árbitro) o editar en borrador no genera avisos', async () => {
    const nuevoArbitro = '00000000-0000-4000-8000-000000000009';
    const { partidos, db, avisos, baseAnterior } = crearEscenario('PUBLICADA');
    db.partido.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseAnterior,
      arbitroId: nuevoArbitro,
    });

    await partidos.editar(42, { arbitroId: nuevoArbitro }, 'org-1');

    expect(db.cambioPartido.createManyAndReturn).not.toHaveBeenCalled();
    expect(avisos.send).not.toHaveBeenCalled();

    const escenarioBorrador = crearEscenario('BORRADOR');
    escenarioBorrador.db.partido.findUniqueOrThrow.mockResolvedValueOnce({
      ...escenarioBorrador.baseAnterior,
      canchaId: 8,
      cancha: { nombre: 'Cancha Alterna' },
    });
    await escenarioBorrador.partidos.editar(42, { canchaId: 8 }, 'org-1');
    expect(escenarioBorrador.avisos.send).not.toHaveBeenCalled();
  });
});
