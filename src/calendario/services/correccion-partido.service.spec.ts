import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '@Prisma/services';
import type { UsersService } from '@Users/services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AvisosService } from '../../avisos/services/avisos.service.js';
import type { PosicionesService } from '../../posiciones/posiciones.service.js';
import { CorreccionPartidoController } from '../controllers/correccion-partido.controller.js';
import { CorreccionPartidoService } from './correccion-partido.service.js';

function crearEstadoCorreccion() {
  const estado = {
    golesLocal: 1,
    golesVisitante: 1,
    estadisticas: new Map<number, { goles: number; asistencias: number; tarjetas: number }>([
      [101, { goles: 1, asistencias: 0, tarjetas: 0 }],
    ]),
    correcciones: [] as Array<{ id: number; motivo: string; antes: unknown; despues: unknown }>,
  };

  let borrador = estado;
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    partido: {
      findUnique: vi.fn(({ select }: { select?: Record<string, unknown> }) => {
        if (select && 'estado' in select) {
          return Promise.resolve({
            estado: 'FINALIZADO',
            temporadaId: 1,
            equipoLocalId: 10,
            equipoVisitanteId: 20,
            golesLocal: borrador.golesLocal,
            golesVisitante: borrador.golesVisitante,
            jornada: { numero: 3 },
          });
        }
        return Promise.resolve({ temporadaId: 1 });
      }),
      update: vi.fn(
        ({ data }: { data: { golesLocal: number; golesVisitante: number } }) => {
          borrador.golesLocal = data.golesLocal;
          borrador.golesVisitante = data.golesVisitante;
          return Promise.resolve({ id: 77 });
        },
      ),
      create: vi.fn(),
    },
    estadisticaPartido: {
      findMany: vi.fn().mockResolvedValue([
        { jugadorId: 101, goles: 1, asistencias: 0, tarjetas: 0 },
      ]),
      upsert: vi.fn(
        ({
          where,
          create,
        }: {
          where: { partidoId_jugadorId: { jugadorId: number } };
          create: { goles: number; asistencias: number; tarjetas: number };
        }) => {
          borrador.estadisticas.set(where.partidoId_jugadorId.jugadorId, {
            goles: create.goles,
            asistencias: create.asistencias,
            tarjetas: create.tarjetas,
          });
          return Promise.resolve({ id: 1 });
        },
      ),
    },
    equipoJugador: {
      findMany: vi.fn().mockResolvedValue([{ jugadorId: 101 }]),
    },
    correccionPartido: {
      create: vi.fn(
        ({ data }: { data: { motivo: string; antes: unknown; despues: unknown } }) => {
          const id = borrador.correcciones.length + 1;
          borrador.correcciones.push({ id, ...data });
          return Promise.resolve({ id });
        },
      ),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      borrador = {
        golesLocal: estado.golesLocal,
        golesVisitante: estado.golesVisitante,
        estadisticas: new Map(estado.estadisticas),
        correcciones: [...estado.correcciones],
      };
      const resultado = await fn(db);
      estado.golesLocal = borrador.golesLocal;
      estado.golesVisitante = borrador.golesVisitante;
      estado.estadisticas = borrador.estadisticas;
      estado.correcciones = borrador.correcciones;
      return resultado;
    }),
  };
  const posiciones = {
    recalcular: vi.fn().mockResolvedValue(undefined),
  };
  const avisos = {
    send: vi.fn().mockResolvedValue({ avisosCreados: 2, avisoIds: [1, 2] }),
  };
  const servicio = new CorreccionPartidoService(
    prisma as unknown as PrismaService,
    posiciones as unknown as PosicionesService,
    avisos as unknown as AvisosService,
  );
  return { servicio, db, prisma, posiciones, avisos, estado };
}

describe('H23. Corregir un resultado oficial', () => {
  it('AC3: actualiza el partido existente y sus estadísticas sin duplicar y recalcula posiciones en la misma transacción', async () => {
    const { servicio, db, posiciones, estado } = crearEstadoCorreccion();

    const respuesta = await servicio.aplicar(
      77,
      {
        motivo: 'Acta arbitral rectificada por gol en tiempo agregado.',
        golesLocal: 2,
        golesVisitante: 1,
        estadisticas: [{ jugadorId: 101, goles: 2, asistencias: 0, tarjetas: 0 }],
      },
      'org-1',
    );

    expect(respuesta).toMatchObject({
      partidoId: 77,
      estado: 'FINALIZADO',
      antes: { golesLocal: 1, golesVisitante: 1 },
      despues: {
        golesLocal: 2,
        golesVisitante: 1,
        estadisticas: [{ jugadorId: 101, goles: 2, asistencias: 0, tarjetas: 0 }],
      },
    });
    expect(db.partido.update).toHaveBeenCalledTimes(1);
    expect(db.partido.create).not.toHaveBeenCalled();
    expect(db.estadisticaPartido.upsert).toHaveBeenCalledTimes(1);
    expect(posiciones.recalcular).toHaveBeenCalledWith(1, db);
    expect(estado.golesLocal).toBe(2);
    expect(estado.estadisticas.get(101)?.goles).toBe(2);
  });

  it('AC4: rechaza visitante sin sesión o usuario distinto de organizador sin modificar datos', async () => {
    const jwt = new JwtService({
      secret: 'secreto-prueba-correccion-h23-ac4',
    });
    const findById = vi.fn();
    const guard = new JwtAuthGuard(new Reflector(), jwt, {
      findById,
    } as unknown as UsersService);

    const aplicarHandler = (
      Object.getOwnPropertyDescriptor(
        CorreccionPartidoController.prototype,
        'aplicar',
      ) as { value: (...args: never[]) => unknown }
    ).value;

    const contexto = (authorization?: string) =>
      ({
        getHandler: () => aplicarHandler,
        getClass: () => CorreccionPartidoController,
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      }) as unknown as ExecutionContext;

    await expect(guard.canActivate(contexto())).rejects.toMatchObject({
      status: 401,
    });

    for (const rol of ['ARBITRO', 'CAPITAN', 'JUGADOR'] as const) {
      const id = randomUUID();
      findById.mockResolvedValueOnce({ id, isActive: true, rol });
      const token = await jwt.signAsync({ sub: id });
      await expect(
        guard.canActivate(contexto(`Bearer ${token}`)),
      ).rejects.toMatchObject({
        status: 403,
        message: 'No tienes permiso para esta acción.',
      });
    }
  });

  it('AC7: si falla el recálculo de posiciones revierte toda la operación conservando los valores anteriores', async () => {
    const { servicio, posiciones, avisos, estado } = crearEstadoCorreccion();
    posiciones.recalcular.mockRejectedValueOnce(new Error('fallo recálculo'));

    await expect(
      servicio.aplicar(
        77,
        {
          motivo: 'Intento de corrección con fallo en tabla de posiciones.',
          golesLocal: 4,
          golesVisitante: 0,
          estadisticas: [{ jugadorId: 101, goles: 4, asistencias: 0, tarjetas: 0 }],
        },
        'org-1',
      ),
    ).rejects.toThrow('fallo recálculo');

    expect(estado.golesLocal).toBe(1);
    expect(estado.golesVisitante).toBe(1);
    expect(estado.estadisticas.get(101)?.goles).toBe(1);
    expect(estado.correcciones).toHaveLength(0);
    expect(avisos.send).not.toHaveBeenCalled();
  });

  it('AC8: al confirmarse la corrección notifica a ambos equipos con el título y mensaje oficiales', async () => {
    const { servicio, avisos } = crearEstadoCorreccion();

    await servicio.aplicar(
      77,
      {
        motivo: 'Corrección de marcador oficial tras revisión de acta.',
        golesLocal: 2,
        golesVisitante: 1,
      },
      'org-1',
    );

    expect(avisos.send).toHaveBeenCalledTimes(2);
    expect(avisos.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        moduloOrigen: 'RESULTADOS',
        tipo: 'RESULTADO_CORREGIDO',
        destinatario: { equipoId: 10, temporadaId: 1 },
        titulo: 'Resultado corregido',
        mensaje:
          'El resultado del partido de la jornada 3 se corrigió a 2-1.',
      }),
    );
    expect(avisos.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        destinatario: { equipoId: 20, temporadaId: 1 },
        titulo: 'Resultado corregido',
        mensaje:
          'El resultado del partido de la jornada 3 se corrigió a 2-1.',
      }),
    );
  });

  it('rechaza partidos no finalizados o correcciones sin cambios', async () => {
    const { servicio, db } = crearEstadoCorreccion();

    await expect(
      servicio.aplicar(
        77,
        {
          motivo: 'Corrección sin ningún cambio real en el resultado.',
          golesLocal: 1,
          golesVisitante: 1,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    db.partido.findUnique
      .mockResolvedValueOnce({ temporadaId: 1 })
      .mockResolvedValueOnce({
        estado: 'EN_CURSO',
        temporadaId: 1,
        equipoLocalId: 10,
        equipoVisitanteId: 20,
        golesLocal: 1,
        golesVisitante: 1,
        jornada: { numero: 3 },
      });

    await expect(
      servicio.aplicar(
        77,
        {
          motivo: 'Partido todavía en curso no puede corregirse como oficial.',
          golesLocal: 2,
          golesVisitante: 1,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
