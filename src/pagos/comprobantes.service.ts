import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type Comprobante = { buffer: Buffer; size: number; mimetype: string };
export const MAX_COMPROBANTE = 5 * 1024 * 1024;
@Injectable()
export class ComprobantesService {
  private readonly logger = new Logger(ComprobantesService.name);
  private readonly directorio: string;
  constructor(config: ConfigService) {
    this.directorio = join(
      config.getOrThrow<string>('UPLOADS_DIR'),
      'comprobantes-privados',
    );
  }
  async validar(archivo: Comprobante | undefined): Promise<string> {
    if (!archivo || archivo.buffer.length === 0)
      throw new BadRequestException(
        'El comprobante es obligatorio y no puede estar vacío.',
      );
    if (archivo.buffer.length > MAX_COMPROBANTE)
      throw new PayloadTooLargeException('El comprobante supera 5 MiB.');
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
      if (
        await new FileTypeValidator({
          fileType: mime,
          overrideMimeType: true,
        }).isValid(archivo)
      )
        return mime;
    }
    throw new UnsupportedMediaTypeException(
      'El contenido del comprobante debe ser PDF, JPEG o PNG.',
    );
  }
  async guardar(buffer: Buffer): Promise<string> {
    await mkdir(this.directorio, { recursive: true, mode: 0o700 });
    const clave = randomUUID();
    const archivo = await open(join(this.directorio, clave), 'wx', 0o600);
    try {
      try {
        await archivo.writeFile(buffer);
      } finally {
        await archivo.close();
      }
    } catch (error) {
      await this.eliminar(clave);
      throw error;
    }
    return clave;
  }
  async leer(clave: string): Promise<Buffer> {
    this.validarClave(clave);
    return readFile(join(this.directorio, clave));
  }
  async existe(clave: string): Promise<boolean> {
    this.validarClave(clave);
    try {
      return (await stat(join(this.directorio, clave))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async eliminar(clave: string): Promise<void> {
    this.validarClave(clave);
    try {
      await rm(join(this.directorio, clave), { force: true });
    } catch {
      this.logger.error({ evento: 'COMPROBANTE_HUERFANO', clave });
      throw new Error('No se pudo eliminar el comprobante huérfano.');
    }
  }
  private validarClave(clave: string): void {
    // UUID generados por H13 y claves relativas existentes del seed. Nunca
    // rutas absolutas, segmentos . / .., barras Windows ni entrada del cliente.
    if (
      clave.length > 255 ||
      !/^(?:[A-Za-z0-9][A-Za-z0-9_-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
        clave,
      )
    )
      throw new Error('Clave de comprobante inválida.');
  }
}
