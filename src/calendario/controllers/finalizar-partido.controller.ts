import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
  FinalizarPartidoParamsDto,
  FinalizarPartidoRespuestaDto,
} from '../dto/finalizar-partido.dto.js';
import { FinalizarPartidoService } from '../services/finalizar-partido.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class FinalizarPartidoController {
  constructor(private readonly partidos: FinalizarPartidoService) {}
  @Post(':partidoId/finalizar')
  @HttpCode(200)
  @ArbitroAsignado()
  @ApiOperation({
    summary: 'Finaliza un partido EN_CURSO',
    description:
      'Solo el árbitro asignado, sin cuerpo (se acepta {}). Estado, finReal, bitácora y recálculo de posiciones son atómicos. Los avisos se envían después del commit; un fallo de envío se registra y no revierte el resultado. Un segundo intento devuelve 409.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
  })
  @ApiOkResponse({ type: FinalizarPartidoRespuestaDto })
  @ApiBadRequestResponse({
    description: 'Identificador inválido o cuerpo con datos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  @ApiConflictResponse({ description: 'El partido no está en curso.' })
  finalizar(
    @Param() { partidoId }: FinalizarPartidoParamsDto,
    @CurrentUser() usuario: User,
    @Body() cuerpo: unknown,
  ): Promise<FinalizarPartidoRespuestaDto> {
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length > 0)
    )
      throw new BadRequestException(
        'Esta acción no admite datos en el cuerpo.',
      );
    return this.partidos.finalizar(partidoId, usuario);
  }
}
