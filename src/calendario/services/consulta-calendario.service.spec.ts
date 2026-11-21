import type { PrismaService } from '@Prisma/services';
import { ConsultaCalendarioService } from './consulta-calendario.service.js';

describe('ConsultaCalendarioService', () => {
  const jugador = { id: 'jugador', rol: 'JUGADOR' } as const;
  const organizador = { id: 'organizador', rol: 'ORGANIZADOR' } as const;
  const capitania = { capitanId: jugador.id, jugadores: [] };
  const ficha = { capitanId: 'otra-cuenta', jugadores: [{ jugadorId: 1 }] };
  const ajeno = { capitanId: 'otra-cuenta', jugadores: [] };
  const partido = {
    id: 2,
    jornada: { numero: 3, estado: 'PUBLICADA' },
    inicio: new Date('2026-11-21T14:00:00Z'),
    fin: new Date('2026-11-21T15:30:00Z'),
    estado: 'PROGRAMADO',
    cancha: { id: 1, nombre: 'Cancha 1', direccion: 'Dirección de prueba' },
    arbitro: { id: 'arbitro', nombre: 'Árbitro' },
    local: { id: 1, nombre: 'Equipo local', ...ajeno },
    visitante: { id: 2, nombre: 'Equipo visitante', ...ficha },
  };
  const prisma = {
    equipo: { findUnique: vi.fn() },
    partido: { findMany: vi.fn(), findUnique: vi.fn() },
  };
  const servicio = new ConsultaCalendarioService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.partido.findMany.mockResolvedValue([]);
  });

  it.each([capitania, ficha])(
    'permite consultar por capitanía o ficha vinculada',
    async (pertenencia) => {
      prisma.equipo.findUnique.mockResolvedValue({
        estado: 'INSCRITO',
        ...pertenencia,
      });

      await expect(servicio.listar(1, jugador)).resolves.toEqual({
        equipoId: 1,
        total: 0,
        partidos: [],
      });
      expect(prisma.partido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            jornada: { estado: 'PUBLICADA' },
            estado: { not: 'CANCELADO' },
          }),
        }),
      );
    },
  );

  it('distingue un equipo ajeno de un equipo propio sin inscripción', async () => {
    prisma.equipo.findUnique.mockResolvedValueOnce({
      estado: 'PENDIENTE',
      ...ajeno,
    });
    await expect(servicio.listar(1, jugador)).rejects.toMatchObject({
      status: 403,
      message: 'No tienes acceso a este calendario.',
    });
    prisma.equipo.findUnique.mockResolvedValueOnce({
      estado: 'PENDIENTE',
      ...capitania,
    });
    await expect(servicio.listar(1, jugador)).rejects.toMatchObject({
      status: 403,
      response: { codigo: 'EQUIPO_NO_INSCRITO' },
    });
    expect(prisma.partido.findMany).not.toHaveBeenCalled();
  });

  it('permite al organizador consultar un equipo sin vínculo ni filtro de publicación', async () => {
    prisma.equipo.findUnique.mockResolvedValue({
      estado: 'PENDIENTE',
      ...ajeno,
    });
    await expect(servicio.listar(1, organizador)).resolves.toMatchObject({
      total: 0,
    });
    expect(prisma.partido.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jornada: undefined,
          estado: { not: 'CANCELADO' },
        }),
      }),
    );
  });

  it('devuelve 404 si el equipo o el partido no existen', async () => {
    prisma.equipo.findUnique.mockResolvedValue(null);
    prisma.partido.findUnique.mockResolvedValue(null);
    await expect(servicio.listar(1, jugador)).rejects.toMatchObject({
      status: 404,
    });
    await expect(servicio.detalle(2, jugador)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('permite el detalle por vínculo con el visitante y devuelve solo los datos públicos', async () => {
    prisma.partido.findUnique.mockResolvedValue(partido);
    await expect(servicio.detalle(2, jugador)).resolves.toEqual({
      id: 2,
      jornada: 3,
      inicio: '2026-11-21T14:00:00.000Z',
      fin: '2026-11-21T15:30:00.000Z',
      estado: 'PROGRAMADO',
      cancha: partido.cancha,
      arbitro: partido.arbitro,
      local: { id: 1, nombre: 'Equipo local' },
      visitante: { id: 2, nombre: 'Equipo visitante' },
    });
  });

  it('rechaza el detalle ajeno aunque esté publicado', async () => {
    prisma.partido.findUnique.mockResolvedValue({
      ...partido,
      visitante: { ...partido.visitante, ...ajeno },
    });
    await expect(servicio.detalle(2, jugador)).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each([
    { jornada: { numero: 3, estado: 'BORRADOR' } },
    { estado: 'CANCELADO' },
  ])(
    'oculta al jugador el detalle de un borrador o cancelado',
    async (cambios) => {
      prisma.partido.findUnique.mockResolvedValue({ ...partido, ...cambios });
      await expect(servicio.detalle(2, jugador)).rejects.toMatchObject({
        status: 404,
      });
      await expect(servicio.detalle(2, organizador)).resolves.toMatchObject({
        id: 2,
      });
    },
  );
});
