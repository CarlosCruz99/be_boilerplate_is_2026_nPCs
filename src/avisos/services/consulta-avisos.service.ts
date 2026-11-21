import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import type {
  AvisoDto,
  AvisosQueryDto,
  ConteoAvisosDto,
  LecturaAvisoDto,
  PaginaAvisosDto,
} from '../dto/consulta-avisos.dto.js';

const avisoSelect = {
  id: true,
  moduloOrigen: true,
  tipo: true,
  titulo: true,
  mensaje: true,
  creadoEn: true,
  leidoEn: true,
  referenciaTipo: true,
  referenciaId: true,
  datos: true,
} satisfies Prisma.AvisoSelect;
type AvisoSeleccionado = Prisma.AvisoGetPayload<{ select: typeof avisoSelect }>;

function serializarAviso({
  creadoEn,
  leidoEn,
  referenciaTipo,
  referenciaId,
  datos,
  ...aviso
}: AvisoSeleccionado): AvisoDto {
  return {
    ...aviso,
    creadoEn: creadoEn.toISOString(),
    leidoEn: leidoEn?.toISOString() ?? null,
    referencia:
      referenciaTipo !== null && referenciaId !== null
        ? { tipo: referenciaTipo, id: referenciaId }
        : null,
    datos:
      datos && typeof datos === 'object' && !Array.isArray(datos)
        ? datos
        : null,
  };
}

@Injectable()
export class ConsultaAvisosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(
    usuarioId: string,
    { pagina, limite }: AvisosQueryDto,
  ): Promise<PaginaAvisosDto> {
    const where = { usuarioId };
    return this.prisma.$transaction(
      async (db) => {
        const total = await db.aviso.count({ where });
        const filas =
          pagina <= Math.ceil(total / limite)
            ? await db.aviso.findMany({
                where,
                select: avisoSelect,
                orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
                skip: (pagina - 1) * limite,
                take: limite,
              })
            : [];
        return { datos: filas.map(serializarAviso), pagina, limite, total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async contarNoLeidos(usuarioId: string): Promise<ConteoAvisosDto> {
    const total = await this.prisma.aviso.count({
      where: { usuarioId, leidoEn: null },
    });
    return { total };
  }

  async detalle(usuarioId: string, id: number): Promise<AvisoDto> {
    const aviso = await this.prisma.aviso.findUnique({
      where: { id, usuarioId },
      select: avisoSelect,
    });
    if (!aviso) return this.rechazarAcceso(id);
    return serializarAviso(aviso);
  }

  async marcarLeido(usuarioId: string, id: number): Promise<LecturaAvisoDto> {
    const aviso = await this.buscarLectura(usuarioId, id);
    if (!aviso) return this.rechazarAcceso(id);
    if (aviso.leidoEn) return { id, leidoEn: aviso.leidoEn.toISOString() };

    // PostgreSQL conserva la primera lectura aunque dos solicitudes lleguen juntas.
    await this.prisma.$executeRaw`
      UPDATE aviso
      SET leido_en = now()
      WHERE id = ${id} AND usuario_id = ${usuarioId}::uuid AND leido_en IS NULL
    `;
    const lectura = await this.buscarLectura(usuarioId, id);
    if (!lectura) return this.rechazarAcceso(id);
    if (!lectura.leidoEn) {
      throw new InternalServerErrorException(
        'No se pudo registrar la lectura del aviso.',
      );
    }
    return { id, leidoEn: lectura.leidoEn.toISOString() };
  }

  private buscarLectura(usuarioId: string, id: number) {
    return this.prisma.aviso.findUnique({
      where: { id, usuarioId },
      select: { leidoEn: true },
    });
  }

  private async rechazarAcceso(id: number): Promise<never> {
    const existe = await this.prisma.aviso.findUnique({
      where: { id },
      select: { id: true },
    });
    if (existe)
      throw new ForbiddenException('No tienes permiso para ver este aviso.');
    throw new NotFoundException('El aviso no existe.');
  }
}
