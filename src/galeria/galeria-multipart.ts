import { BadRequestException } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

export const limiteGaleria = 30;
export const limiteFoto = 5 * 1024 * 1024;
export const limiteVideo = 50 * 1024 * 1024;

export interface ArchivoTemporal {
  nombre: string;
  ruta: string;
  bytes: number;
  motivo?: string;
}

async function recibirArchivo(
  stream: Readable & { truncated?: boolean },
  nombre: string,
  ruta: string,
): Promise<ArchivoTemporal> {
  const destino = await open(ruta, 'wx', 0o600).catch(() => null);
  let errorDisco = !destino;
  let bytes = 0;
  try {
    // Consumir toda la parte permite que el lector avance al siguiente archivo.
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (destino && !errorDisco) {
        try {
          await destino.writeFile(chunk);
        } catch {
          errorDisco = true;
        }
      }
    }
  } finally {
    await destino?.close();
  }
  if (stream.truncated || bytes > limiteVideo) {
    return { nombre, ruta, bytes, motivo: 'El archivo supera 50 MiB.' };
  }
  if (errorDisco) {
    return {
      nombre,
      ruta,
      bytes,
      motivo: 'No se pudo almacenar el archivo temporal.',
    };
  }
  return { nombre, ruta, bytes };
}

export async function leerGaleria(req: Request, directorio: string) {
  if (!req.is('multipart/form-data')) {
    throw new BadRequestException(
      'Envía los archivos como multipart/form-data.',
    );
  }
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: req.headers,
      defParamCharset: 'utf8',
      limits: {
        files: limiteGaleria,
        fileSize: limiteVideo + 1,
        fields: 1,
        fieldSize: 1024,
      },
    });
  } catch {
    throw new BadRequestException('La solicitud multipart es inválida.');
  }
  const archivos: Promise<ArchivoTemporal>[] = [];
  let descripcion: string | null = null;
  let error: string | undefined;
  const partes = new Set<Readable>();
  const interrumpir = () => parser.destroy(new Error('Subida interrumpida.'));
  try {
    await new Promise<void>((resolver, rechazar) => {
      parser.on('file', (campo, stream, { filename }) => {
        if (campo !== 'archivos[]') {
          error = 'Usa el campo archivos[] para cada archivo.';
          stream.resume();
          return;
        }
        partes.add(stream);
        const nombre = (filename ?? '').split(/[\\/]/u).at(-1)?.trim() ?? '';
        const ruta = join(directorio, String(archivos.length));
        archivos.push(
          recibirArchivo(stream, nombre, ruta)
            .catch(() => ({
              nombre,
              ruta,
              bytes: 0,
              motivo: 'No se pudo recibir el archivo.',
            }))
            .finally(() => {
              partes.delete(stream);
            }),
        );
      });
      parser.on('field', (campo, valor, info) => {
        if (campo !== 'descripcion')
          error = 'El único campo de texto permitido es descripcion.';
        else if (info.valueTruncated || /.{201}/su.test(valor)) {
          error = 'La descripción admite hasta 200 caracteres.';
        } else if (valor.includes('\0')) {
          error = 'La descripción contiene un carácter inválido.';
        } else descripcion = valor.trim() || null;
      });
      parser.on('filesLimit', () => {
        error = 'Envía un máximo de 30 archivos por solicitud.';
      });
      parser.on('fieldsLimit', () => {
        error = 'Envía la descripción una sola vez.';
      });
      parser.once('error', () =>
        rechazar(
          new BadRequestException(
            'La solicitud multipart está incompleta o es inválida.',
          ),
        ),
      );
      parser.once('close', resolver);
      req.once('aborted', interrumpir);
      req.once('error', interrumpir);
      if (req.destroyed) interrumpir();
      else req.pipe(parser);
    });
  } catch (fallo) {
    req.unpipe(parser);
    req.resume();
    for (const parte of partes) parte.destroy();
    await Promise.all(archivos);
    throw fallo;
  } finally {
    req.off('aborted', interrumpir);
    req.off('error', interrumpir);
  }
  const recibidos = await Promise.all(archivos);
  if (error) throw new BadRequestException(error);
  if (archivos.length === 0)
    throw new BadRequestException('Selecciona al menos un archivo.');
  return { descripcion, archivos: recibidos };
}
