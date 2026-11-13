import { Body, Controller, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { ArbitroAsignado } from '../autorizacion/arbitro-asignado.decorator.js';
import {
  ActualizarMarcadorDto,
  MarcadorParamsDto,
  MarcadorRespuestaDto,
} from '../dto/marcador.dto.js';
import { MarcadorService } from '../services/marcador.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class MarcadorController {
  constructor(private readonly marcador: MarcadorService) {}

  @Patch(':partidoId/marcador')
  @ArbitroAsignado()
  @ApiOperation({
    summary: 'Actualiza marcador y faltas de un partido EN_CURSO',
    description:
      'Solo el árbitro asignado. Los cuatro enteros de 0 a 99 son obligatorios. Reemplaza los valores y registra una instantánea en bitácora dentro de la misma transacción, incluso al repetir valores.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: MarcadorRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Identificador inválido, valores ausentes, no numéricos, no enteros, fuera de 0 a 99 o campos no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({
    description: 'No tienes permiso para esta acción.',
    schema: { example: { mensaje: 'No tienes permiso para esta acción.' } },
  })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  @ApiConflictResponse({
    description:
      'El partido no está EN_CURSO. Si está FINALIZADO, solo procede la corrección autorizada (H23).',
  })
  actualizar(
    @Param() { partidoId }: MarcadorParamsDto,
    @Body() dto: ActualizarMarcadorDto,
    @CurrentUser() usuario: User,
  ): Promise<MarcadorRespuestaDto> {
    return this.marcador.actualizar(partidoId, dto, usuario);
  }
}
