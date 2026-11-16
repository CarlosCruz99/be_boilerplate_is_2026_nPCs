import {
  ConflictException,
  FileTypeValidator,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@Prisma/services';
import type { Request } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  leerGaleria,
  limiteFoto,
  limiteGaleria,
  type ArchivoTemporal,
} from './galeria-multipart.js';

export type ResultadoArchivo =
  | { nombre: string; estado: 'PUBLICADO'; contenidoId: string }
  | { nombre: string; estado: 'ERROR'; motivo: string };

const formatos = {
  'image/jpeg': { tipo: 'FOTO', extension: 'jpg' },
  'image/png': { tipo: 'FOTO', extension: 'png' },
  'video/mp4': { tipo: 'VIDEO', extension: 'mp4' },
} as const;
const tipoArchivo = new FileTypeValidator({
  fileType: /^(image\/(jpeg|png)|video\/mp4)$/,
  overrideMimeType: true,
});

@Injectable()
export class GaleriaService {
  private readonly logger = new Logger(GaleriaService.name);
  private readonly raiz: string;
  private readonly directorio: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.raiz = config.getOrThrow<string>('UPLOADS_DIR');
    this.directorio = join(this.raiz, 'galeria');
  }

  async subir(partidoId: number, organizadorId: string, req: Request) {
    if (
      !(await this.prisma.partido.findUnique({
        where: { id: partidoId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('El partido no existe.');
    }
    await mkdir(this.directorio, { recursive: true, mode: 0o700 });
    const temporal = await mkdtemp(join(this.directorio, '.subida-'));
    try {
      const { archivos, descripcion } = await leerGaleria(req, temporal);
      const resultados: ResultadoArchivo[] = [];
      for (const archivo of archivos) {
        resultados.push(
          await this.publicar(partidoId, organizadorId, descripcion, archivo),
        );
      }
      const totalActivos = await this.prisma.contenidoGaleria.count({
        where: { partidoId, estado: 'ACTIVO' },
      });
      return { partidoId, totalActivos, limite: limiteGaleria, resultados };
    } finally {
      await rm(temporal, { recursive: true, force: true }).catch(() =>
        this.logger.error(
          'No se pudo limpiar un directorio temporal de galería.',
        ),
      );
    }
  }

  private async publicar(
    partidoId: number,
    organizadorId: string,
    descripcion: string | null,
    archivo: ArchivoTemporal,
  ): Promise<ResultadoArchivo> {
    const { nombre, ruta, bytes } = archivo;
    const rechazar = (motivo: string): ResultadoArchivo => ({
      nombre,
      estado: 'ERROR',
      motivo,
    });
    if (archivo.motivo) return rechazar(archivo.motivo);
    if (!nombre || /.{256}/su.test(nombre) || nombre.includes('\0')) {
      return rechazar(
        'El nombre del archivo debe tener entre 1 y 255 caracteres.',
      );
    }
    if (bytes === 0) return rechazar('El archivo está vacío.');

    let guardado: string | undefined;
    try {
      const buffer = await readFile(ruta);
      const datosArchivo = { buffer, size: bytes, mimetype: '' };
      if (!(await tipoArchivo.isValid(datosArchivo))) {
        return rechazar('Formato no permitido. Usa JPG, PNG o MP4.');
      }
      const mimeType = datosArchivo.mimetype as keyof typeof formatos;
      const { tipo, extension } = formatos[mimeType];
      if (tipo === 'FOTO' && bytes > limiteFoto)
        return rechazar('La foto supera 5 MiB.');

      // La huella permite repetir una subida confirmada sin guardar otra copia.
      const huella = createHash('sha256')
        .update(JSON.stringify([partidoId, organizadorId, nombre, descripcion]))
        .update(buffer)
        .digest('hex');
      const prefijo = `galeria/${huella}-`;
      const contenido = await this.prisma.$transaction(
        async (db) => {
          const filas = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM partido WHERE id = ${partidoId} FOR NO KEY UPDATE
        `;
          if (filas.length === 0)
            throw new NotFoundException('El partido no existe.');
          const activos = { partidoId, estado: 'ACTIVO' as const };
          const previo = await db.contenidoGaleria.findFirst({
            where: { ...activos, storageKey: { startsWith: prefijo } },
            select: { id: true },
          });
          if (previo) return previo;
          if (
            (await db.contenidoGaleria.count({ where: activos })) >=
            limiteGaleria
          ) {
            throw new ConflictException(
              'El partido ya tiene 30 archivos activos en la galería.',
            );
          }
          const storageKey = `${prefijo}${randomUUID()}.${extension}`;
          const destino = join(this.raiz, storageKey);
          await rename(ruta, destino);
          guardado = destino;
          return db.contenidoGaleria.create({
            data: {
              partidoId,
              storageKey,
              tipo,
              mimeType,
              descripcion,
              nombreOriginal: nombre,
              tamanoBytes: bytes,
              subidoPor: organizadorId,
            },
            select: { id: true },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return { nombre, estado: 'PUBLICADO', contenidoId: contenido.id };
    } catch (error) {
      if (guardado) {
        await rm(guardado, { force: true }).catch(() =>
          this.logger.error(
            'No se pudo eliminar un archivo de galería sin metadatos.',
          ),
        );
      }
      if (error instanceof HttpException) return rechazar(error.message);
      this.logger.error({ evento: 'SUBIDA_GALERIA_FALLIDA', partidoId });
      return rechazar('No se pudo publicar el archivo. Puedes reintentarlo.');
    }
  }
}
