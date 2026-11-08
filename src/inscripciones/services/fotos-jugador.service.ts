import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvConfig } from '@Config';
import { PrismaService } from '@Prisma/services';

export type FotoJugador = { extension: 'jpg' | 'png'; buffer: Buffer };
const URL_FOTOS = '/uploads/jugadores';

@Injectable()
export class FotosJugadorService {
  private readonly logger = new Logger(FotosJugadorService.name);
  private readonly directorio: string;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.directorio = join(
      config.get('UPLOADS_DIR', { infer: true }),
      'jugadores',
    );
  }

  url(jugadorId: number, extension: FotoJugador['extension']): string {
    return `${URL_FOTOS}/${jugadorId}.${extension}`;
  }

  async guardar(
    jugadorId: number,
    { extension, buffer }: FotoJugador,
  ): Promise<() => Promise<void>> {
    const ruta = join(this.directorio, `${jugadorId}.${extension}`);
    await mkdir(this.directorio, { recursive: true });
    const archivo = await open(ruta, 'wx');
    const limpiar = async () => {
      try {
        await rm(ruta, { force: true });
      } catch (error) {
        this.logger.error(
          `No se pudo quitar la foto de la ficha ${jugadorId}.`,
          error,
        );
      }
    };
    try {
      try {
        await archivo.writeFile(buffer);
      } finally {
        await archivo.close();
      }
      return limpiar;
    } catch (error) {
      await limpiar();
      throw error;
    }
  }

  async descargar(archivo: string, usuarioId: string): Promise<StreamableFile> {
    if (!/^[1-9]\d*\.(jpg|png)$/.test(archivo)) {
      throw new NotFoundException('La foto no existe.');
    }
    const ficha = await this.prisma.jugador.findFirst({
      where: {
        fotoUrl: `${URL_FOTOS}/${archivo}`,
        OR: [
          { usuarioId },
          { equipos: { some: { equipo: { capitanId: usuarioId } } } },
        ],
      },
      select: { id: true },
    });
    if (!ficha) throw new NotFoundException('La foto no existe.');

    try {
      return new StreamableFile(
        await readFile(join(this.directorio, archivo)),
        {
          type: archivo.endsWith('.png') ? 'image/png' : 'image/jpeg',
        },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('La foto no existe.');
      }
      throw error;
    }
  }
}
