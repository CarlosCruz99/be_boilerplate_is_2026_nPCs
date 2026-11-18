import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { User } from '@PrismaClient';
export type CapitanActor = Pick<User, 'id' | 'rol' | 'isActive'>;
export function exigirCapitan(
  usuario: CapitanActor | undefined,
  capitanId: string,
): void {
  if (!usuario?.isActive)
    throw new UnauthorizedException('Sesión no válida. Inicia sesión.');
  if (usuario.rol !== 'JUGADOR' || usuario.id !== capitanId)
    throw new ForbiddenException('No tienes permiso para esta acción.');
}
