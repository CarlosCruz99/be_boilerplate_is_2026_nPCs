import { ConflictException, Logger } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { EstadisticasPersonalesService } from '../../estadisticas/services/estadisticas-personales.service.js';
import { JugadoresDestacadosService } from '../../estadisticas/services/jugadores-destacados.service.js';
import { ArbitroPartidoService } from '../autorizacion/arbitro-partido.service.js';
import { EstadisticasPartidoService } from './estadisticas-partido.service.js';

describe('H09. Registro de estadísticas individuales por partido', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC4: solo marca resultadoOficial en partidos FINALIZADO y las consultas agregadas filtran por temporada y estado FINALIZADO', async () => {
    const arbitro = {
      id: '00000000-0000-4000-8000-000000000001',
      rol: 'ARBITRO' as const,
      isActive: true,
    };

    const crearDbPartido = (estado: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO') => {
      const db = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        partido: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({
              id: 15,
              arbitroId: arbitro.id,
              temporadaId: 4,
              equipoLocalId: 10,
              equipoVisitanteId: 20,
              estado,
            })
            .mockResolvedValue({
              temporadaId: 4,
              id: 15,
              arbitroId: arbitro.id,
              equipoLocalId: 10,
              equipoVisitanteId: 20,
              estado,
            }),
        },
        equipoJugador: { findMany: vi.fn().mockResolvedValue([]) },
        estadisticaPartido: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { jugadorId: 7, goles: 2, asistencias: 1, tarjetas: 0 },
            ]),
        },
      };
      return {
        db,
        servicio: new EstadisticasPartidoService(
          {
            $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) =>
              fn(db),
            ),
          } as unknown as PrismaService,
          new ArbitroPartidoService(),
        ),
      };
    };

    const enCurso = crearDbPartido('EN_CURSO');
    await expect(enCurso.servicio.consultar(15, arbitro)).resolves.toMatchObject(
      {
        partidoId: 15,
        estado: 'EN_CURSO',
        resultadoOficial: false,
      },
    );

    const finalizado = crearDbPartido('FINALIZADO');
    await expect(
      finalizado.servicio.consultar(15, arbitro),
    ).resolves.toMatchObject({
      partidoId: 15,
      estado: 'FINALIZADO',
      resultadoOficial: true,
    });

    await expect(
      finalizado.servicio.guardar(
        15,
        7,
        { goles: 3, asistencias: 1, tarjetas: 0 },
        arbitro,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const dbPersonales = {
      temporada: { findUnique: vi.fn().mockResolvedValue({ id: 4 }) },
      jugador: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
      equipoJugador: {
        findUnique: vi.fn().mockResolvedValue({ equipo: { estado: 'INSCRITO' } }),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          partidoId: 15,
          fecha: new Date('2026-11-20T18:00:00.000Z'),
          rival: 'Leones FC',
          goles: 2,
          asistencias: 1,
          tarjetas: 0,
        },
      ]),
    };
    const personales = new EstadisticasPersonalesService({
      $transaction: vi.fn((fn: (tx: typeof dbPersonales) => Promise<unknown>) =>
        fn(dbPersonales),
      ),
    } as unknown as PrismaService);

    const resPersonal = await personales.consultar(4, 'user-7');
    expect(resPersonal.acumulados).toEqual({
      goles: 2,
      asistencias: 1,
      tarjetas: 0,
    });
    const [sqlPersonal] = dbPersonales.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
    ];
    expect(sqlPersonal.join(' ')).toContain('p.temporada_id =');
    expect(sqlPersonal.join(' ')).toContain("p.estado = 'FINALIZADO'");

    const dbDestacados = {
      temporada: { findUnique: vi.fn().mockResolvedValue({ id: 4 }) },
      $queryRaw: vi
        .fn()
        .mockResolvedValue([
          { jugadorId: 7, nombre: 'Carlos Ruiz', total: 2, posicion: 1 },
        ]),
    };
    const destacados = new JugadoresDestacadosService({
      $transaction: vi.fn((fn: (tx: typeof dbDestacados) => Promise<unknown>) =>
        fn(dbDestacados),
      ),
    } as unknown as PrismaService);

    const resDestacados = await destacados.consultar(4, 'goles');
    expect(resDestacados.jugadores).toHaveLength(1);
    const [sqlDestacados] = dbDestacados.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
    ];
    expect(sqlDestacados.join(' ')).toContain('p.temporada_id =');
    expect(sqlDestacados.join(' ')).toContain("p.estado = 'FINALIZADO'");
  });
});
