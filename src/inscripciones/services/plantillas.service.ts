import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type Jugador } from '@PrismaClient';
import type { AgregarJugadorDto, JugadorDto } from '../dto/jugador.dto.js';
import {
  FotosJugadorService,
  type FotoJugador,
} from './fotos-jugador.service.js';

const LIMITE_JUGADORES = 15;

@Injectable()
export class PlantillasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotos: FotosJugadorService,
  ) {}

  async listar(equipoId: number, capitanId: string): Promise<JugadorDto[]> {
    await this.verificarEquipo(this.prisma, equipoId, capitanId);
    const plantilla = await this.prisma.equipoJugador.findMany({
      where: { equipoId },
      include: { jugador: true },
      orderBy: { jugadorId: 'asc' },
    });
    return plantilla.map(({ jugador }) => this.respuesta(jugador, equipoId));
  }

  async agregar(
    equipoId: number,
    capitanId: string,
    datos: AgregarJugadorDto,
    foto: FotoJugador,
  ) {
    try {
      return await this.inscribir(equipoId, capitanId, datos, foto);
    } catch (error) {
      // Dos equipos pueden intentar crear la misma ficha a la vez. El segundo
      // intento encuentra la ficha ganadora y aplica la regla de su temporada.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.inscribir(equipoId, capitanId, datos, foto);
      }
      throw error;
    }
  }

  private async inscribir(
    equipoId: number,
    capitanId: string,
    { nombreCompleto, identificacion, fechaNacimiento }: AgregarJugadorDto,
    foto: FotoJugador,
  ): Promise<JugadorDto> {
    let limpiarFoto: (() => Promise<void>) | undefined;

    try {
      return await this.prisma.$transaction(
        async (db) => {
          const { temporadaId } = await this.bloquearEquipoPendiente(
            db,
            equipoId,
            capitanId,
          );
          const [ficha] = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM jugador WHERE identificacion = ${identificacion} FOR NO KEY UPDATE
        `;
          const existente =
            ficha &&
            (await db.jugador.findUniqueOrThrow({ where: { id: ficha.id } }));

          if (existente) {
            const inscripcion = await db.equipoJugador.findUnique({
              where: {
                temporadaId_jugadorId: { temporadaId, jugadorId: existente.id },
              },
              select: { equipo: { select: { id: true, nombre: true } } },
            });
            if (inscripcion) {
              throw new ConflictException(
                inscripcion.equipo.id === equipoId
                  ? 'El jugador ya pertenece a este equipo.'
                  : `El jugador ya pertenece al equipo ${inscripcion.equipo.nombre} en esta temporada.`,
              );
            }
            if (
              existente.nombreCompleto !== nombreCompleto ||
              existente.fechaNacimiento.toISOString().slice(0, 10) !==
                fechaNacimiento
            ) {
              throw new ConflictException(
                'La identificación ya existe y los datos de la ficha no coinciden.',
              );
            }
          }

          const total = await db.equipoJugador.count({ where: { equipoId } });
          if (total >= LIMITE_JUGADORES) {
            throw new UnprocessableEntityException(
              'El equipo ya tiene 15 jugadores.',
            );
          }

          const jugador =
            existente ??
            (await db.jugador.create({
              data: {
                identificacion,
                nombreCompleto,
                fechaNacimiento: new Date(fechaNacimiento),
                fotoUrl: '',
              },
            }));
          await db.equipoJugador.create({
            data: { equipoId, jugadorId: jugador.id, temporadaId },
          });

          if (existente) return this.respuesta(jugador, equipoId);
          const fotoUrl = this.fotos.url(jugador.id, foto.extension);
          const conFoto = await db.jugador.update({
            where: { id: jugador.id },
            data: { fotoUrl },
          });
          limpiarFoto = await this.fotos.guardar(jugador.id, foto);
          return this.respuesta(conFoto, equipoId);
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      await limpiarFoto?.();
      throw error;
    }
  }

  async quitar(
    equipoId: number,
    capitanId: string,
    jugadorId: number,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (db) => {
        await this.bloquearEquipoPendiente(db, equipoId, capitanId);
        const { count } = await db.equipoJugador.deleteMany({
          where: { equipoId, jugadorId },
        });
        if (!count)
          throw new NotFoundException('El jugador no pertenece a este equipo.');
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async verificarEquipo(
    db: Prisma.TransactionClient,
    equipoId: number,
    capitanId: string,
  ) {
    const equipo = await db.equipo.findUnique({
      where: { id: equipoId },
      select: { capitanId: true, estado: true, temporadaId: true },
    });
    if (!equipo) throw new NotFoundException('El equipo no existe.');
    if (equipo.capitanId !== capitanId)
      throw new ForbiddenException('No tienes permiso para esta acción.');
    return equipo;
  }

  private async bloquearEquipoPendiente(
    db: Prisma.TransactionClient,
    equipoId: number,
    capitanId: string,
  ) {
    // Altas y bajas de la misma plantilla se turnan antes de comprobar el cupo.
    await db.$queryRaw`SELECT id FROM equipo WHERE id = ${equipoId} FOR NO KEY UPDATE`;
    const equipo = await this.verificarEquipo(db, equipoId, capitanId);
    if (equipo.estado !== 'PENDIENTE') {
      throw new UnprocessableEntityException(
        'El equipo ya no puede modificarse.',
      );
    }
    return equipo;
  }

  private respuesta(jugador: Jugador, equipoId: number): JugadorDto {
    return {
      ...jugador,
      equipoId,
      fechaNacimiento: jugador.fechaNacimiento.toISOString().slice(0, 10),
    };
  }
}
