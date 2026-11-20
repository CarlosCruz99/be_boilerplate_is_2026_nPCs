import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@Prisma/services';
import type { Prisma, User } from '@PrismaClient';
import { realpath, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  elementosPorPagina,
  tiposArchivoGaleria,
  type PaginaGaleriaDto,
} from './consulta-galeria.dto.js';

type ActorGaleria = Pick<User, 'id' | 'rol'>;

@Injectable()
export class ConsultaGaleriaService {
  private readonly raiz: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.raiz = config.getOrThrow<string>('UPLOADS_DIR');
  }

  listar(
    partidoId: number,
    page: number,
    usuario: ActorGaleria,
  ): Promise<PaginaGaleriaDto> {
    return this.prisma.$transaction(
      async (db) => {
        await this.exigirAcceso(db, partidoId, usuario);
        const where = { partidoId, estado: 'ACTIVO' } as const;
        const pageSize = elementosPorPagina;
        const totalElementos = await db.contenidoGaleria.count({ where });
        const totalPaginas = Math.ceil(totalElementos / pageSize);
        const pagina = { page, pageSize, totalElementos, totalPaginas };
        if (page > totalPaginas) return { ...pagina, items: [] };

        const filas = await db.contenidoGaleria.findMany({
          where,
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            tipo: true,
            descripcion: true,
            creadoEn: true,
            mimeType: true,
          },
        });
        return {
          ...pagina,
          items: filas.map(({ creadoEn, ...item }) => ({
            ...item,
            creadoEn: creadoEn.toISOString(),
            url: `/api/v1/partidos/${partidoId}/galeria/${item.id}/archivo`,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async archivo(partidoId: number, contenidoId: string, usuario: ActorGaleria) {
    const contenido = await this.prisma.$transaction(
      async (db) => {
        await this.exigirAcceso(db, partidoId, usuario);
        return db.contenidoGaleria.findUnique({
          where: { id: contenidoId, partidoId, estado: 'ACTIVO' },
          select: { storageKey: true, mimeType: true },
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );

    const inexistente = () =>
      new NotFoundException('El archivo de la galería no existe.');
    if (
      !contenido ||
      !/^(?:seed\/)?galeria\/[a-z0-9_-]+\.(?:jpe?g|png|mp4)$/i.test(
        contenido.storageKey,
      )
    ) {
      throw inexistente();
    }
    const mimeType = tiposArchivoGaleria.find(
      (tipo) => tipo === contenido.mimeType,
    );
    if (!mimeType) throw inexistente();

    try {
      const raizReal = await realpath(this.raiz);
      const esperada = resolve(raizReal, contenido.storageKey);
      const ruta = await realpath(esperada);
      // La clave sólo puede resolver al archivo esperado del almacenamiento de galería.
      if (relative(esperada, ruta) !== '' || !(await stat(ruta)).isFile()) {
        throw inexistente();
      }
      return { ruta, mimeType };
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR', 'ELOOP'].some((codigo) => codigo === error.code)
      ) {
        throw inexistente();
      }
      throw error;
    }
  }

  private async exigirAcceso(
    db: Prisma.TransactionClient,
    partidoId: number,
    usuario: ActorGaleria,
  ) {
    const partido = await db.partido.findUnique({
      where: { id: partidoId },
      select: {
        temporadaId: true,
        equipoLocalId: true,
        equipoVisitanteId: true,
      },
    });
    if (!partido) throw new NotFoundException('El partido no existe.');
    if (usuario.rol === 'ORGANIZADOR') return;

    const equipo =
      usuario.rol === 'JUGADOR' &&
      (await db.equipo.findFirst({
        where: {
          id: { in: [partido.equipoLocalId, partido.equipoVisitanteId] },
          temporadaId: partido.temporadaId,
          OR: [
            { capitanId: usuario.id },
            { jugadores: { some: { jugador: { usuarioId: usuario.id } } } },
          ],
        },
        select: { id: true },
      }));
    if (!equipo)
      throw new ForbiddenException(
        'No tienes acceso a la galería de este partido.',
      );
  }
}
