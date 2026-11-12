import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import type {
  CrearPartidoDto,
  EditarPartidoDto,
  PartidoRespuestaDto,
} from '../dto/partido.dto.js';
import { limitesSemana } from '../utils/semana.js';
import { traducirConflictoPartido } from '../utils/conflictos-partido.js';
import { AvisosCambioPartidoService } from './avisos-cambio-partido.service.js';

const partidoSelect = {
  id: true,
  equipoLocalId: true,
  equipoVisitanteId: true,
  canchaId: true,
  arbitroId: true,
  inicio: true,
  fin: true,
  estado: true,
  jornada: { select: { numero: true, estado: true } },
} satisfies Prisma.PartidoSelect;
const partidoParaEdicionSelect = {
  ...partidoSelect,
  cancha: { select: { nombre: true } },
  local: { select: { nombre: true } },
  visitante: { select: { nombre: true } },
} satisfies Prisma.PartidoSelect;
type PartidoSeleccionado = Prisma.PartidoGetPayload<{
  select: typeof partidoSelect;
}>;

@Injectable()
export class PartidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisosCambio: AvisosCambioPartidoService,
  ) {}

  arbitros() {
    return this.prisma.user.findMany({
      where: { rol: 'ARBITRO', isActive: true },
      select: { id: true, nombre: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
  }

  canchas(activa?: boolean) {
    return this.prisma.cancha.findMany({
      where: activa === undefined ? {} : { activa },
      select: { id: true, nombre: true, direccion: true, activa: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
  }

  async crear(dto: CrearPartidoDto): Promise<PartidoRespuestaDto> {
    try {
      return await this.prisma.$transaction(
        async (db) => {
          await this.bloquearTemporada(db, dto.temporadaId);
          const inicio = new Date(dto.inicio);
          this.validarInicio(inicio);
          const fin = new Date(inicio.getTime() + 90 * 60_000);
          const equipos = await this.validarReferencias(
            db,
            dto.temporadaId,
            dto.equipoLocalId,
            dto.equipoVisitanteId,
            dto.canchaId,
            dto.arbitroId,
          );
          const jornada = await db.jornada.upsert({
            where: {
              temporadaId_numero: {
                temporadaId: dto.temporadaId,
                numero: dto.jornada,
              },
            },
            create: {
              temporadaId: dto.temporadaId,
              numero: dto.jornada,
              estado: 'BORRADOR',
            },
            update: {},
            select: { id: true },
          });
          // Las exclusiones y el índice de cruce son la autoridad de los 409.
          const [creado] = await db.$queryRaw<{ id: number }[]>`
          INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin)
          VALUES (${dto.temporadaId},${jornada.id},${dto.equipoLocalId},${dto.equipoVisitanteId},${dto.canchaId},${dto.arbitroId}::uuid,${inicio},${fin}) RETURNING id
        `;
          await this.validarSemana(db, creado.id, inicio, equipos);
          return this.respuesta(
            await db.partido.findUniqueOrThrow({
              where: { id: creado.id },
              select: partidoSelect,
            }),
          );
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      traducirConflictoPartido(error);
    }
  }

  async editar(
    id: number,
    dto: EditarPartidoDto,
    organizadorId: string,
  ): Promise<PartidoRespuestaDto> {
    const campos = Object.keys(dto).filter(
      (campo) => dto[campo as keyof EditarPartidoDto] !== undefined,
    );
    if (!campos.length)
      throw new BadRequestException('Debes indicar al menos un cambio.');
    if (dto.estado === 'CANCELADO' && campos.length !== 1) {
      throw new BadRequestException(
        'La cancelación debe enviarse sin otros cambios.',
      );
    }
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const referencia = await db.partido.findUnique({
            where: { id },
            select: { temporadaId: true },
          });
          if (!referencia) throw new NotFoundException('El partido no existe.');
          await this.bloquearTemporada(db, referencia.temporadaId);
          await db.$queryRaw`SELECT id FROM partido WHERE id=${id} FOR NO KEY UPDATE`;
          const anterior = await db.partido.findUnique({
            where: { id },
            select: partidoParaEdicionSelect,
          });
          if (!anterior) throw new NotFoundException('El partido no existe.');
          if (anterior.estado === 'EN_CURSO') {
            throw new ConflictException(
              dto.estado === 'CANCELADO'
                ? 'No se puede cambiar de ‘En curso’ a ‘Cancelado’.'
                : 'No se puede reprogramar un partido En curso.',
            );
          }
          if (
            anterior.estado === 'FINALIZADO' ||
            anterior.estado === 'CANCELADO'
          ) {
            throw new UnprocessableEntityException(
              'No se puede modificar un partido Finalizado o Cancelado.',
            );
          }
          if (dto.estado === 'CANCELADO') {
            // PROGRAMADO -> CANCELADO no exige inicio futuro ni elegibilidad
            // actual de recursos: debe poder liberar partidos pasados.
            const cancelado = await db.partido.update({
              where: { id },
              data: { estado: 'CANCELADO' },
              select: partidoSelect,
            });
            return this.respuesta(cancelado);
          }
          const inicio =
            dto.inicio === undefined ? anterior.inicio : new Date(dto.inicio);
          const canchaId = dto.canchaId ?? anterior.canchaId;
          const arbitroId = dto.arbitroId ?? anterior.arbitroId;
          this.validarInicio(inicio);
          const fin = new Date(inicio.getTime() + 90 * 60_000);
          const equipos = await this.validarReferencias(
            db,
            referencia.temporadaId,
            anterior.equipoLocalId,
            anterior.equipoVisitanteId,
            canchaId,
            arbitroId,
          );
          await db.$queryRaw`
          UPDATE partido SET cancha_id=${canchaId}, arbitro_id=${arbitroId}::uuid, inicio=${inicio}, fin=${fin}
          WHERE id=${id} RETURNING id
        `;
          await this.validarSemana(db, id, inicio, equipos);
          const actualizado = await db.partido.findUniqueOrThrow({
            where: { id },
            select: partidoParaEdicionSelect,
          });
          if (anterior.jornada.estado === 'PUBLICADA') {
            await this.avisosCambio.registrar(
              db,
              referencia.temporadaId,
              organizadorId,
              anterior,
              actualizado,
            );
          }
          return this.respuesta(actualizado);
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      traducirConflictoPartido(error);
    }
  }

  private async bloquearTemporada(
    db: Prisma.TransactionClient,
    temporadaId: number,
  ): Promise<void> {
    // Mismo orden temporada -> entidad que H2. Serializa la regla semanal
    // entre altas y ediciones; las exclusiones protegen recursos entre temporadas.
    const filas = await db.$queryRaw<
      { id: number }[]
    >`SELECT id FROM temporada WHERE id=${temporadaId} FOR UPDATE`;
    if (!filas.length) throw new NotFoundException('La temporada no existe.');
  }

  private validarInicio(inicio: Date): void {
    if (!Number.isFinite(inicio.getTime()) || inicio.getTime() <= Date.now())
      throw new BadRequestException('El inicio debe ser una fecha futura.');
  }

  private async validarReferencias(
    db: Prisma.TransactionClient,
    temporadaId: number,
    localId: number,
    visitanteId: number,
    canchaId: number,
    arbitroId: string,
  ) {
    if (localId === visitanteId)
      throw new UnprocessableEntityException('Elige dos equipos distintos.');
    const equipos = await db.equipo.findMany({
      where: { id: { in: [localId, visitanteId] } },
      select: { id: true, nombre: true, temporadaId: true, estado: true },
    });
    if (equipos.length !== 2)
      throw new NotFoundException('El equipo no existe.');
    if (
      equipos.some(
        (e) => e.temporadaId !== temporadaId || e.estado !== 'INSCRITO',
      )
    )
      throw new UnprocessableEntityException(
        'Ambos equipos deben estar inscritos en la temporada del partido.',
      );
    const cancha = await db.cancha.findUnique({
      where: { id: canchaId },
      select: { activa: true },
    });
    if (!cancha) throw new NotFoundException('La cancha no existe.');
    if (!cancha.activa)
      throw new UnprocessableEntityException('La cancha está inactiva.');
    const arbitro = await db.user.findUnique({
      where: { id: arbitroId },
      select: { rol: true, isActive: true },
    });
    if (!arbitro) throw new NotFoundException('El árbitro no existe.');
    if (arbitro.rol !== 'ARBITRO')
      throw new UnprocessableEntityException(
        'El usuario elegido no es árbitro.',
      );
    if (!arbitro.isActive)
      throw new UnprocessableEntityException('El árbitro está inactivo.');
    return equipos;
  }

  private async validarSemana(
    db: Prisma.TransactionClient,
    id: number,
    inicio: Date,
    equipos: { id: number; nombre: string }[],
  ): Promise<void> {
    const { desde, hasta } = limitesSemana(inicio);
    const ids = equipos.map((equipo) => equipo.id);
    const otro = await db.partido.findFirst({
      where: {
        id: { not: id },
        estado: { not: 'CANCELADO' },
        inicio: { gte: desde, lt: hasta },
        OR: [
          { equipoLocalId: { in: ids } },
          { equipoVisitanteId: { in: ids } },
        ],
      },
      select: { equipoLocalId: true, equipoVisitanteId: true },
      orderBy: { id: 'asc' },
    });
    // Se comprueba después de escribir: un cruce duplicado mantiene prioridad
    // 409; si falla la semana, se revierten partido y jornada de esta transacción.
    if (otro) {
      const equipo = equipos.find(
        (e) => e.id === otro.equipoLocalId || e.id === otro.equipoVisitanteId,
      )!;
      throw new UnprocessableEntityException(
        `${equipo.nombre} ya tiene un partido esa semana.`,
      );
    }
  }

  private respuesta({
    id,
    equipoLocalId,
    equipoVisitanteId,
    canchaId,
    arbitroId,
    estado,
    jornada,
    inicio,
    fin,
  }: PartidoSeleccionado): PartidoRespuestaDto {
    return {
      id,
      equipoLocalId,
      equipoVisitanteId,
      canchaId,
      arbitroId,
      estado,
      jornada: jornada.numero,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
    };
  }
}
