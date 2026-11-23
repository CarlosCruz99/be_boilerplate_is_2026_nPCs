import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  type ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '@Prisma/services';
import type { UsersService } from '@Users/services';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AvisosService } from '../avisos/services/avisos.service.js';
import { CrearCuotaDto } from './cuota.dto.js';
import { CuotasController } from './cuotas.controller.js';
import { CuotasService } from './cuotas.service.js';

function crearEscenario() {
  const db = {
    temporada: {
      findUnique: vi.fn().mockResolvedValue({ id: 1 }),
    },
    equipo: {
      findUnique: vi.fn().mockResolvedValue({
        temporadaId: 1,
        estado: 'INSCRITO',
        capitanId: 'cap-1',
      }),
    },
    partido: {
      findUnique: vi.fn().mockResolvedValue({
        temporadaId: 1,
        equipoLocalId: 10,
        equipoVisitanteId: 20,
        estado: 'PROGRAMADO',
      }),
    },
    cuota: {
      create: vi.fn().mockResolvedValue({
        id: 50,
        temporadaId: 1,
        equipoId: 10,
        concepto: 'INSCRIPCION',
        monto: { toFixed: () => '125.00' },
        fechaVencimiento: new Date('2099-12-31T00:00:00Z'),
        partidoId: null,
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
  };
  const prisma = {
    $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const avisos = {
    send: vi.fn().mockResolvedValue({ avisosCreados: 1, avisoIds: [1] }),
  };
  const servicio = new CuotasService(
    prisma as unknown as PrismaService,
    avisos as unknown as AvisosService,
  );
  return { servicio, db, avisos };
}

describe('H12. Registro de cuotas de inscripción y arbitraje', () => {
  it('AC3: solo permite registrar cuotas para equipos inscritos en la temporada seleccionada', async () => {
    const { servicio, db, avisos } = crearEscenario();

    const creada = await servicio.crear(
      {
        temporadaId: 1,
        equipoId: 10,
        concepto: 'INSCRIPCION',
        monto: '125.00',
        fechaVencimiento: '2099-12-31',
      },
      'org-1',
    );

    expect(creada).toMatchObject({
      id: 50,
      temporadaId: 1,
      equipoId: 10,
      concepto: 'INSCRIPCION',
      monto: '125.00',
    });
    expect(avisos.send).toHaveBeenCalledWith(
      expect.objectContaining({
        moduloOrigen: 'PAGOS',
        tipo: 'CUOTA_REGISTRADA',
        destinatario: { usuarioId: 'cap-1' },
      }),
    );

    db.equipo.findUnique.mockResolvedValueOnce({
      temporadaId: 1,
      estado: 'PENDIENTE',
      capitanId: 'cap-1',
    });
    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'INSCRIPCION',
          monto: '125.00',
          fechaVencimiento: '2099-12-31',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('AC4: cuando el concepto es arbitraje exige y valida un partido de la temporada donde participe el equipo', async () => {
    const { servicio, db } = crearEscenario();
    db.cuota.create.mockResolvedValueOnce({
      id: 51,
      temporadaId: 1,
      equipoId: 10,
      concepto: 'ARBITRAJE',
      monto: { toFixed: () => '25.00' },
      fechaVencimiento: new Date('2099-12-31T00:00:00Z'),
      partidoId: 99,
    });

    const arbitrajeDto = Object.assign(new CrearCuotaDto(), {
      temporadaId: 1,
      equipoId: 10,
      concepto: 'ARBITRAJE',
      monto: '25.00',
      fechaVencimiento: '2099-12-31',
    });
    const erroresSinPartido = await validate(arbitrajeDto);
    expect(erroresSinPartido.some((e) => e.property === 'partidoId')).toBe(
      true,
    );

    const creada = await servicio.crear(
      {
        temporadaId: 1,
        equipoId: 10,
        concepto: 'ARBITRAJE',
        monto: '25.00',
        fechaVencimiento: '2099-12-31',
        partidoId: 99,
      },
      'org-1',
    );
    expect(creada).toMatchObject({
      concepto: 'ARBITRAJE',
      partidoId: 99,
      monto: '25.00',
    });
  });

  it('AC5: rechaza equipo no inscrito, otra temporada, equipo ajeno al partido o partido cancelado explicando el motivo', async () => {
    const { servicio, db, avisos } = crearEscenario();

    db.equipo.findUnique.mockResolvedValueOnce({
      temporadaId: 2,
      estado: 'INSCRITO',
      capitanId: 'cap-1',
    });
    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'INSCRIPCION',
          monto: '100.00',
          fechaVencimiento: '2099-12-31',
        },
        'org-1',
      ),
    ).rejects.toThrow(
      'El equipo debe estar inscrito en la temporada seleccionada.',
    );

    db.partido.findUnique.mockResolvedValueOnce({
      temporadaId: 2,
      equipoLocalId: 10,
      equipoVisitanteId: 20,
      estado: 'PROGRAMADO',
    });
    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'ARBITRAJE',
          monto: '25.00',
          fechaVencimiento: '2099-12-31',
          partidoId: 99,
        },
        'org-1',
      ),
    ).rejects.toThrow(
      'El partido debe pertenecer a la temporada, incluir al equipo y no estar cancelado.',
    );

    db.partido.findUnique.mockResolvedValueOnce({
      temporadaId: 1,
      equipoLocalId: 30,
      equipoVisitanteId: 40,
      estado: 'PROGRAMADO',
    });
    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'ARBITRAJE',
          monto: '25.00',
          fechaVencimiento: '2099-12-31',
          partidoId: 99,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    db.partido.findUnique.mockResolvedValueOnce({
      temporadaId: 1,
      equipoLocalId: 10,
      equipoVisitanteId: 20,
      estado: 'CANCELADO',
    });
    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'ARBITRAJE',
          monto: '25.00',
          fechaVencimiento: '2099-12-31',
          partidoId: 99,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'INSCRIPCION',
          monto: '100.00',
          fechaVencimiento: '2020-01-01',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.cuota.create).not.toHaveBeenCalled();
    expect(avisos.send).not.toHaveBeenCalled();
  });

  it('AC6: rechaza por duplicidad si ya existe una cuota de inscripción para el equipo y la temporada', async () => {
    const { servicio, db, avisos } = crearEscenario();
    db.cuota.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'INSCRIPCION',
          monto: '125.00',
          fechaVencimiento: '2099-12-31',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(avisos.send).not.toHaveBeenCalled();
  });

  it('AC7: rechaza por duplicidad si ya existe una cuota de arbitraje para el equipo y el partido', async () => {
    const { servicio, db, avisos } = crearEscenario();
    db.cuota.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      servicio.crear(
        {
          temporadaId: 1,
          equipoId: 10,
          concepto: 'ARBITRAJE',
          monto: '25.00',
          fechaVencimiento: '2099-12-31',
          partidoId: 99,
        },
        'org-1',
      ),
    ).rejects.toThrow(
      'Ya existe una cuota de ese concepto para el equipo y la temporada o partido.',
    );
    expect(avisos.send).not.toHaveBeenCalled();
  });

  it('AC8: bloquea el registro sin sesión o con cualquier rol distinto de organizador', async () => {
    const jwt = new JwtService({
      secret: 'secreto-prueba-cuotas-h12-ac8',
    });
    const findById = vi.fn();
    const guard = new JwtAuthGuard(new Reflector(), jwt, {
      findById,
    } as unknown as UsersService);

    const crearHandler = (
      Object.getOwnPropertyDescriptor(CuotasController.prototype, 'crear') as {
        value: (...args: never[]) => unknown;
      }
    ).value;

    const contextoConHeader = (authorization?: string) =>
      ({
        getHandler: () => crearHandler,
        getClass: () => CuotasController,
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      }) as unknown as ExecutionContext;

    await expect(guard.canActivate(contextoConHeader())).rejects.toMatchObject({
      status: 401,
    });

    for (const rol of ['CAPITAN', 'JUGADOR', 'ARBITRO'] as const) {
      const id = randomUUID();
      findById.mockResolvedValueOnce({ id, isActive: true, rol });
      const token = await jwt.signAsync({ sub: id });
      await expect(
        guard.canActivate(contextoConHeader(`Bearer ${token}`)),
      ).rejects.toMatchObject({
        status: 403,
        message: 'No tienes permiso para esta acción.',
      });
    }

    const orgId = randomUUID();
    findById.mockResolvedValueOnce({
      id: orgId,
      isActive: true,
      rol: 'ORGANIZADOR',
    });
    const orgToken = await jwt.signAsync({ sub: orgId });
    await expect(
      guard.canActivate(contextoConHeader(`Bearer ${orgToken}`)),
    ).resolves.toBe(true);
  });
});
