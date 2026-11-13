import 'reflect-metadata';
import {
  Controller,
  Patch,
  Post,
  Put,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '@Users/services';
import { ArbitroAsignado } from './arbitro-asignado.decorator.js';
import { ArbitroAsignadoGuard } from './arbitro-asignado.guard.js';
import { ArbitroPartidoService } from './arbitro-partido.service.js';

const ejecutarAccion = vi.fn(() => ({ ok: true }));

// Rutas exclusivamente de prueba: comprueban la protección sin implementar BE-5.1/2/4/5.
@Controller('partidos')
class AccionesPruebaController {
  @Patch(':partidoId/marcador')
  @ArbitroAsignado()
  marcador() {
    return ejecutarAccion();
  }
  @Post(':partidoId/finalizar')
  @ArbitroAsignado()
  finalizar() {
    return ejecutarAccion();
  }
  @Post(':partidoId/iniciar')
  @ArbitroAsignado()
  iniciar() {
    return ejecutarAccion();
  }
  @Put(':id/participantes')
  @ArbitroAsignado('id')
  participantes() {
    return ejecutarAccion();
  }
}

describe('BE-5.3: guard HTTP con autenticación global y rutas de prueba', () => {
  let app: INestApplication<Server>;
  const findUnique = vi.fn();
  const asignado = '00000000-0000-4000-8000-000000000001';
  const usuarios = new Map<string, User>([
    ['asignado', { id: asignado, rol: 'ARBITRO', isActive: true } as User],
    [
      'otro',
      {
        id: '00000000-0000-4000-8000-000000000002',
        rol: 'ARBITRO',
        isActive: true,
      } as User,
    ],
    [
      'jugador',
      {
        id: '00000000-0000-4000-8000-000000000003',
        rol: 'JUGADOR',
        isActive: true,
      } as User,
    ],
    [
      'capitan',
      {
        id: '00000000-0000-4000-8000-000000000004',
        rol: 'JUGADOR',
        isActive: true,
      } as User,
    ],
    [
      'organizador',
      {
        id: '00000000-0000-4000-8000-000000000005',
        rol: 'ORGANIZADOR',
        isActive: true,
      } as User,
    ],
    [
      'inactivo',
      {
        id: '00000000-0000-4000-8000-000000000006',
        rol: 'ARBITRO',
        isActive: false,
      } as User,
    ],
  ]);
  const acciones = [
    ['patch', 'marcador', 200],
    ['post', 'iniciar', 201],
    ['post', 'finalizar', 201],
    ['put', 'participantes', 200],
  ] as const;
  const peticion = (
    metodo: 'patch' | 'post' | 'put',
    accion: string,
    id = '12',
  ) => request(app.getHttpServer())[metodo](`/partidos/${id}/${accion}`);

  beforeAll(async () => {
    const reflector = new Reflector();
    const modulo = await Test.createTestingModule({
      controllers: [AccionesPruebaController],
      providers: [
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: { partido: { findUnique } } },
        ArbitroPartidoService,
        ArbitroAsignadoGuard,
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.useLogger(false);
    // Se conserva el guard real; solo se sustituyen verificación criptográfica y consulta de cuentas.
    app.useGlobalGuards(
      new JwtAuthGuard(
        reflector,
        {
          verifyAsync: async (token: string) => {
            const user = usuarios.get(token);
            if (!user) throw new Error('Token inválido');
            return { sub: user.id };
          },
        } as unknown as JwtService,
        {
          findById: async (id: string) =>
            [...usuarios.values()].find((u) => u.id === id),
        } as unknown as UsersService,
      ),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: 12, arbitroId: asignado });
  });

  it.each(acciones)(
    'permite al asignado en %s %s',
    async (metodo, accion, codigo) => {
      await peticion(metodo, accion)
        .auth('asignado', { type: 'bearer' })
        .expect(codigo);
      expect(ejecutarAccion).toHaveBeenCalledOnce();
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 12 },
        select: { id: true, arbitroId: true },
      });
    },
  );

  it.each(acciones)(
    'deniega a otros roles y árbitros en %s %s sin ejecutar la acción',
    async (metodo, accion) => {
      for (const token of ['otro', 'jugador', 'capitan', 'organizador']) {
        const r = await peticion(metodo, accion)
          .auth(token, { type: 'bearer' })
          .expect(403);
        expect(r.body).toEqual({
          mensaje: 'No tienes permiso para esta acción.',
        });
      }
      expect(ejecutarAccion).not.toHaveBeenCalled();
      // Los tres usuarios sin rol ARBITRO se rechazan sin consultar el partido.
      expect(findUnique).toHaveBeenCalledTimes(1);
    },
  );

  it.each(acciones)('exige sesión activa en %s %s', async (metodo, accion) => {
    await peticion(metodo, accion).expect(401);
    for (const token of ['invalido', 'inactivo']) {
      await peticion(metodo, accion)
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
    expect(findUnique).not.toHaveBeenCalled();
    expect(ejecutarAccion).not.toHaveBeenCalled();
  });

  it('responde 404 al árbitro si el partido no existe', async () => {
    findUnique.mockResolvedValue(null);
    await peticion('patch', 'marcador')
      .auth('asignado', { type: 'bearer' })
      .expect(404);
    expect(ejecutarAccion).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'abc', '2147483648'])(
    'rechaza id inválido %s antes de consultar',
    async (id) => {
      await peticion('patch', 'marcador', id)
        .auth('asignado', { type: 'bearer' })
        .expect(400);
      expect(findUnique).not.toHaveBeenCalled();
      expect(ejecutarAccion).not.toHaveBeenCalled();
    },
  );
});
