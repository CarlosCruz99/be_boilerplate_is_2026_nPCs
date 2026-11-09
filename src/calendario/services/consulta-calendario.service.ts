import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma, User } from '@PrismaClient';
import type {
  CalendarioDelEquipoDto,
  DetallePartidoCalendarioDto,
  PartidoDelEquipoDto,
} from '../dto/consulta-calendario.dto.js';

type UsuarioCalendario = Pick<User, 'id' | 'rol'>;

const equipoResumen = { id: true, nombre: true } satisfies Prisma.EquipoSelect;

const datosPartido = {
  id: true,
  jornada: { select: { numero: true } },
  inicio: true,
  fin: true,
  estado: true,
  cancha: { select: { id: true, nombre: true, direccion: true } },
  arbitro: { select: { id: true, nombre: true } },
} satisfies Prisma.PartidoSelect;
type DatosPartido = Prisma.PartidoGetPayload<{ select: typeof datosPartido }>;

function seleccionarPertenencia(usuarioId: string) {
  return {
    capitanId: true,
    jugadores: {
      where: { jugador: { usuarioId } },
      select: { jugadorId: true },
      take: 1,
    },
  } satisfies Prisma.EquipoSelect;
}

type PertenenciaEquipo = Prisma.EquipoGetPayload<{
  select: ReturnType<typeof seleccionarPertenencia>;
}>;

function pertenece(equipo: PertenenciaEquipo, usuarioId: string): boolean {
  return equipo.capitanId === usuarioId || equipo.jugadores.length > 0;
}

function serializarPartido({
  id,
  jornada,
  inicio,
  fin,
  estado,
  cancha,
  arbitro,
}: DatosPartido) {
  return {
    id,
    jornada: jornada.numero,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    estado,
    cancha,
    arbitro,
  };
}

@Injectable()
export class ConsultaCalendarioService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    equipoId: number,
    usuario: UsuarioCalendario,
  ): Promise<CalendarioDelEquipoDto> {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      select: { estado: true, ...seleccionarPertenencia(usuario.id) },
    });
    if (!equipo) throw new NotFoundException('El equipo no existe.');

    const esOrganizador = usuario.rol === 'ORGANIZADOR';
    if (!esOrganizador) {
      if (!pertenece(equipo, usuario.id)) {
        throw new ForbiddenException('No tienes acceso a este calendario.');
      }
      if (equipo.estado !== 'INSCRITO') {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          codigo: 'EQUIPO_NO_INSCRITO',
          message: 'Tu equipo aún no está inscrito en la temporada.',
        });
      }
    }

    const filas = await this.prisma.partido.findMany({
      where: {
        OR: [{ equipoLocalId: equipoId }, { equipoVisitanteId: equipoId }],
        estado: { not: 'CANCELADO' },
        jornada: esOrganizador ? undefined : { estado: 'PUBLICADA' },
      },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      select: {
        ...datosPartido,
        local: { select: equipoResumen },
        visitante: { select: equipoResumen },
      },
    });
    const partidos = filas.map((partido): PartidoDelEquipoDto => {
      const esLocal = partido.local.id === equipoId;
      return {
        ...serializarPartido(partido),
        rival: esLocal ? partido.visitante : partido.local,
        condicion: esLocal ? 'LOCAL' : 'VISITANTE',
      };
    });
    return { equipoId, total: partidos.length, partidos };
  }

  async detalle(
    id: number,
    usuario: UsuarioCalendario,
  ): Promise<DetallePartidoCalendarioDto> {
    const equipoDetalle = {
      ...equipoResumen,
      ...seleccionarPertenencia(usuario.id),
    };
    const partido = await this.prisma.partido.findUnique({
      where: { id },
      select: {
        ...datosPartido,
        jornada: { select: { numero: true, estado: true } },
        local: { select: equipoDetalle },
        visitante: { select: equipoDetalle },
      },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');

    const { local, visitante } = partido;
    if (usuario.rol !== 'ORGANIZADOR') {
      if (!pertenece(local, usuario.id) && !pertenece(visitante, usuario.id)) {
        throw new ForbiddenException('No tienes acceso a este partido.');
      }
      if (
        partido.estado === 'CANCELADO' ||
        partido.jornada.estado !== 'PUBLICADA'
      ) {
        throw new NotFoundException('El partido no existe.');
      }
    }

    return {
      ...serializarPartido(partido),
      local: { id: local.id, nombre: local.nombre },
      visitante: { id: visitante.id, nombre: visitante.nombre },
    };
  }
}
