import {
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { ComprobantesService } from './comprobantes.service.js';

/** El llamador debe autorizar al actor antes de invocar esta función privada. */
export async function descargarComprobante(
  archivos: ComprobantesService,
  pagoId: number,
  pago: {
    comprobanteClave: string;
    comprobanteMime: string;
    comprobanteBytes: number;
  },
): Promise<StreamableFile> {
  let archivo: Buffer;
  try {
    archivo = await archivos.leer(pago.comprobanteClave);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new NotFoundException('El comprobante no existe.');
    throw error;
  }
  const extensiones: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  const extension = extensiones[pago.comprobanteMime];
  if (!extension || archivo.length !== pago.comprobanteBytes)
    throw new InternalServerErrorException(
      'No se pudo recuperar el comprobante.',
    );
  return new StreamableFile(archivo, {
    type: pago.comprobanteMime,
    length: archivo.length,
    disposition: `attachment; filename="pago-${pagoId}.${extension}"`,
  });
}
