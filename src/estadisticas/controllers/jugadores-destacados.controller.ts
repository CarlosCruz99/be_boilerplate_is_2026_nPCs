import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '@Auth/decorators';
import {
  JugadoresDestacadosQueryDto,
  JugadoresDestacadosRespuestaDto,
  TemporadaDestacadosParamsDto,
} from '../dto/jugadores-destacados.dto.js';
import { JugadoresDestacadosService } from '../services/jugadores-destacados.service.js';

@ApiTags('estadísticas')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('temporadas')
export class JugadoresDestacadosController {
  constructor(private readonly destacados: JugadoresDestacadosService) {}

  @Get(':temporadaId/jugadores-destacados')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({
    name: 'temporadaId',
    schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  })
  @ApiOperation({
    summary:
      'Consulta la clasificación de jugadores destacados por goles o asistencias en una temporada',
    description:
      'Solo para organizadores. Considera únicamente partidos FINALIZADO de la temporada y calcula posiciones densas en tiempo real.',
  })
  @ApiOkResponse({ type: JugadoresDestacadosRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Identificador de temporada, métrica o parámetros adicionales inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({
    description: 'No tienes permiso para esta acción.',
  })
  @ApiNotFoundResponse({ description: 'La temporada no existe.' })
  @ApiInternalServerErrorResponse({
    description: 'Error interno al consultar la clasificación.',
  })
  consultar(
    @Param() { temporadaId }: TemporadaDestacadosParamsDto,
    @Query() { metrica }: JugadoresDestacadosQueryDto,
    @Req() request: Request,
  ): Promise<JugadoresDestacadosRespuestaDto> {
    const cuerpo: unknown = request.body;
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length > 0)
    ) {
      throw new BadRequestException('Campo no permitido.');
    }
    return this.destacados.consultar(temporadaId, metrica);
  }
}
