import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { UsersService } from '@Users/services';
import { Public } from '../decorators/public.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

class Routes {
  @Public()
  publicRoute(this: void) {}

  @Roles('JUGADOR')
  playerRoute(this: void) {}
}

function requestContext(handler: () => void, authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };
  const context = {
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({
    secret: 'secreto-de-prueba-para-el-guard-global',
  });
  const user = { id: randomUUID(), isActive: true, rol: 'ARBITRO' };
  const findById = vi.fn().mockResolvedValue(user);
  const guard = new JwtAuthGuard(new Reflector(), jwt, {
    findById,
  } as unknown as UsersService);

  it('adjunta una sesión válida en una ruta pública', async () => {
    const token = await jwt.signAsync({ sub: user.id });
    const { context, request } = requestContext(
      Routes.prototype.publicRoute,
      `Bearer ${token}`,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
  });

  it('permite visitas anónimas con un token inválido en una ruta pública', async () => {
    const { context, request } = requestContext(
      Routes.prototype.publicRoute,
      'Bearer invalid',
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('aplica el rol de la base aunque el token declare otro', async () => {
    const token = await jwt.signAsync({ sub: user.id, rol: 'JUGADOR' });
    const { context } = requestContext(
      Routes.prototype.playerRoute,
      `Bearer ${token}`,
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
      message: 'No tienes permiso para esta acción.',
    });
  });

  it('devuelve 401 sin sesión en una ruta con roles', async () => {
    const { context } = requestContext(Routes.prototype.playerRoute);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      message: 'Sesión no válida. Inicia sesión.',
    });
  });
});
