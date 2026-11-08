import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { DatosFichaDto } from '../dto/jugador.dto.js';
import type { VinculacionDto } from '../dto/vinculacion.dto.js';

@Injectable()
export class VinculacionService {
  constructor(private readonly prisma: PrismaService) {}

  async vincular(
    usuarioId: string,
    datos: DatosFichaDto,
  ): Promise<VinculacionDto> {
    try {
      return await this.prisma.$transaction(
        async (db) => {
          // Comparte el bloqueo de la cuenta con el registro de equipos.
          await db.$queryRaw`SELECT id FROM usuario WHERE id = ${usuarioId}::uuid FOR NO KEY UPDATE`;
          const ficha = await db.jugador.findUnique({
            where: {
              identificacion: datos.identificacion,
              fechaNacimiento: new Date(datos.fechaNacimiento),
            },
            select: { id: true },
          });
          if (!ficha)
            throw new NotFoundException(
              'No encontramos una ficha con esos datos.',
            );

          const { count } = await db.jugador.updateMany({
            where: { id: ficha.id, usuarioId: null },
            data: { usuarioId },
          });
          if (!count)
            throw new ConflictException('Esa ficha ya está vinculada.');

          const inscripcion = await db.equipoJugador.findFirst({
            where: { jugadorId: ficha.id },
            orderBy: [
              { equipo: { temporada: { actual: 'desc' } } },
              { equipo: { temporada: { fechaInicio: 'desc' } } },
              { temporadaId: 'desc' },
            ],
            select: { equipoId: true, temporadaId: true },
          });
          return {
            jugadorId: ficha.id,
            equipoId: inscripcion?.equipoId ?? null,
            temporadaId: inscripcion?.temporadaId ?? null,
          };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tu cuenta ya tiene una ficha vinculada.');
      }
      throw error;
    }
  }
}
