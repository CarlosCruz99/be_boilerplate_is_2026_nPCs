import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import {
  ArbitroAsignadoGuard,
  PARAMETRO_PARTIDO,
} from './arbitro-asignado.guard.js';

/** El nombre debe coincidir con :partidoId (o :id) en la ruta. */
export function ArbitroAsignado(parametro = 'partidoId') {
  return applyDecorators(
    SetMetadata(PARAMETRO_PARTIDO, parametro),
    UseGuards(ArbitroAsignadoGuard),
  );
}
