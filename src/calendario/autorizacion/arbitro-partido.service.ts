import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';

export type ActorPartido = Pick<User, 'id' | 'rol' | 'isActive'>;
export type AsignacionPartido = { id: number; arbitroId: string };

/** Regla de H5, reutilizable desde el guard y desde una transacción. */
@Injectable()
export class ArbitroPartidoService {
  private readonly logger = new Logger(ArbitroPartidoService.name);

  exigirRol(
    usuario: ActorPartido | undefined,
    partidoId: number | null,
  ): asserts usuario is ActorPartido {
    if (!usuario?.isActive) {
      this.registrarRechazo(usuario, partidoId);
      throw new UnauthorizedException('Sesión no válida. Inicia sesión.');
    }
    if (usuario.rol !== 'ARBITRO') this.denegar(usuario, partidoId);
  }

  exigirAsignacion(
    usuario: ActorPartido | undefined,
    partido: AsignacionPartido,
  ): void {
    this.exigirRol(usuario, partido.id);
    if (usuario.id !== partido.arbitroId) this.denegar(usuario, partido.id);
  }

  private denegar(usuario: ActorPartido, partidoId: number | null): never {
    this.registrarRechazo(usuario, partidoId);
    throw new ForbiddenException({
      mensaje: 'No tienes permiso para esta acción.',
    });
  }

  private registrarRechazo(
    usuario: ActorPartido | undefined,
    partidoId: number | null,
  ): void {
    this.logger.warn({
      evento: 'ACCESO_ARBITRO_PARTIDO_DENEGADO',
      usuarioId: usuario?.id ?? null,
      partidoId,
      fecha: new Date().toISOString(),
    });
  }
}
