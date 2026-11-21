import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { UsersService } from '@Users/services';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '@Auth/types';
import type { RolUsuario } from '@PrismaClient';

/**
 * Guard global: valida el Bearer token y carga el usuario en el request.
 *
 * Se implementa a mano en vez de usar Passport porque `passport-jwt` es CJS y
 * su interoperabilidad con ESM estricto es frágil. El costo es unas pocas
 * líneas y se gana control sobre el mensaje de error.
 *
 * Importa los decoradores por ruta relativa y no por `@Auth/decorators` para
 * no crear un ciclo entre los barrels de guards/ y decorators/.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(
      ROLES_KEY,
      targets,
    );
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);
    const userId = token && (await this.verifyToken(token));
    const user = userId ? await this.usersService.findById(userId) : null;

    if (!user?.isActive) {
      if (isPublic && !roles?.length) return true;
      throw new UnauthorizedException('Sesión no válida. Inicia sesión.');
    }

    if (roles?.length && !roles.includes(user.rol)) {
      throw new ForbiddenException('No tienes permiso para esta acción.');
    }

    request.user = user;
    return true;
  }

  private async verifyToken(token: string): Promise<string | null> {
    try {
      const { sub } = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          algorithms: ['HS256'],
        },
      );
      return isUUID(sub) ? sub : null;
    } catch {
      return null;
    }
  }

  private extractBearerToken(header: string | undefined): string | null {
    return /^Bearer ([^\s]+)$/i.exec(header ?? '')?.[1] ?? null;
  }
}
