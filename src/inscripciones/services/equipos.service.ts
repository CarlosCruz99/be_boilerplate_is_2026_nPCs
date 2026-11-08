import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type {
  CrearEquipoDto,
  EquipoDto,
  MiEquipoDto,
} from '../dto/equipo.dto.js';

const equipoSelect = {
  id: true,
  nombre: true,
  temporadaId: true,
  capitanId: true,
  estado: true,
} satisfies Prisma.EquipoSelect;

const CUENTA_CON_EQUIPO = 'Ya tienes un equipo en esta temporada.';

@Injectable()
export class EquiposService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(
    capitanId: string,
    { nombre, temporadaId }: CrearEquipoDto,
  ): Promise<EquipoDto> {
    const capitania = { temporadaId, capitanId };

    try {
      return await this.prisma.$transaction(
        async (db) => {
          const [temporada] = await db.$queryRaw<
            { inscripcionAbierta: boolean }[]
          >`
          SELECT inscripcion_abierta AS "inscripcionAbierta"
          FROM temporada WHERE id = ${temporadaId} FOR SHARE
        `;
          if (!temporada)
            throw new NotFoundException('La temporada no existe.');
          if (!temporada.inscripcionAbierta) {
            throw new UnprocessableEntityException(
              'La inscripción de la temporada está cerrada.',
            );
          }

          // Coordina la comprobación de pertenencia con la vinculación de fichas.
          await db.$queryRaw`SELECT id FROM usuario WHERE id = ${capitanId}::uuid FOR NO KEY UPDATE`;
          const conEquipo = await db.user.count({
            where: {
              id: capitanId,
              OR: [
                { equiposCapitan: { some: { temporadaId } } },
                { jugador: { equipos: { some: { temporadaId } } } },
              ],
            },
          });
          if (conEquipo) throw new ConflictException(CUENTA_CON_EQUIPO);

          return db.equipo.create({
            data: { nombre, ...capitania, estado: 'PENDIENTE' },
            select: equipoSelect,
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const equipo = await this.prisma.equipo.findUnique({
        where: { temporadaId_capitanId: capitania },
        select: { id: true },
      });
      throw new ConflictException(
        equipo
          ? CUENTA_CON_EQUIPO
          : 'Ya existe un equipo con ese nombre en la temporada.',
      );
    }
  }

  async miEquipo(capitanId: string, temporadaId: number): Promise<MiEquipoDto> {
    const equipo = await this.prisma.equipo.findUnique({
      where: { temporadaId_capitanId: { temporadaId, capitanId } },
      select: {
        ...equipoSelect,
        motivoRechazo: true,
        _count: { select: { jugadores: true } },
      },
    });
    if (!equipo)
      throw new NotFoundException('No tienes un equipo en esta temporada.');
    const { _count, ...datos } = equipo;
    return { ...datos, totalJugadores: _count.jugadores };
  }
}
