import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@Prisma/services';
import type { RequestWithUser } from '../../auth/decorators/current-user.decorator.js';
import { ArbitroPartidoService } from './arbitro-partido.service.js';

export const PARAMETRO_PARTIDO = 'h5:parametro-partido';

/** Se ejecuta después del JwtAuthGuard global. No modifica el partido. */
@Injectable()
export class ArbitroAsignadoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const parametro =
      this.reflector.getAllAndOverride<string>(PARAMETRO_PARTIDO, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'partidoId';
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const valor = request.params[parametro];
    const numero =
      typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
    const id =
      Number.isInteger(numero) && numero >= 1 && numero <= 2_147_483_647
        ? numero
        : null;

    // Se rechaza el rol antes de consultar la existencia del partido.
    this.autorizacion.exigirRol(request.user, id);
    if (id === null)
      throw new BadRequestException(
        'El identificador del partido debe ser un entero positivo válido.',
      );
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      select: { id: true, arbitroId: true },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');
    this.autorizacion.exigirAsignacion(request.user, partido);
    return true;
  }
}
