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

import type {
  ListarEquiposQueryDto,
  ListadoEquiposDto,
  DetalleEquipoDto,
} from '../dto/consulta-equipos.dto.js';
import { calcularEdad } from '../utils/edad.js';

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

  async listar({
    temporadaId,
    estado,
    page,
    pageSize,
  }: ListarEquiposQueryDto): Promise<ListadoEquiposDto> {
    const where = { temporadaId, estado };
    // El total y la página corresponden a la misma instantánea de lectura.
    const [equipos, total] = await this.prisma.$transaction(
      [
        this.prisma.equipo.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            nombre: true,
            estado: true,
            creadoEn: true,
            capitan: { select: { nombre: true } },
            _count: { select: { jugadores: true } },
          },
        }),
        this.prisma.equipo.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: equipos.map(({ capitan, _count, creadoEn, ...equipo }) => ({
        ...equipo,
        nombreCapitan: capitan.nombre,
        totalJugadores: _count.jugadores,
        creadoEn: creadoEn.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async detalle(id: number): Promise<DetalleEquipoDto> {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id },
      select: {
        ...equipoSelect,
        creadoEn: true,
        motivoRechazo: true,
        capitan: { select: { nombre: true } },
        jugadores: {
          orderBy: { jugadorId: 'asc' },
          select: {
            jugador: {
              select: {
                id: true,
                nombreCompleto: true,
                fechaNacimiento: true,
                fotoUrl: true,
              },
            },
          },
        },
      },
    });
    if (!equipo) throw new NotFoundException('El equipo no existe.');
    const referencia = new Date();
    const { capitan, jugadores, creadoEn, ...datos } = equipo;
    return {
      ...datos,
      creadoEn: creadoEn.toISOString(),
      nombreCapitan: capitan.nombre,
      totalJugadores: jugadores.length,
      jugadores: jugadores.map(
        ({ jugador: { fechaNacimiento, ...jugador } }) => ({
          ...jugador,
          edad: calcularEdad(fechaNacimiento, referencia),
        }),
      ),
    };
  }
}
