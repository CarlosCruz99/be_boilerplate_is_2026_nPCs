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
  ReporteDeportivoDto,
  SinParametrosReporteDeportivoDto,
  TemporadaReporteDeportivoParamsDto,
} from './reporte-deportivo.dto.js';
import { ReporteDeportivoService } from './reporte-deportivo.service.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('temporadas')
export class ReporteDeportivoController {
  constructor(private readonly reporte: ReporteDeportivoService) {}

  @Get(':temporadaId/reporte-deportivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiParam({
    name: 'temporadaId',
    schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  })
  @ApiOperation({
    summary: 'Consulta los indicadores deportivos oficiales de una temporada',
    description:
      'Solo para organizadores. Agrega partidos, goles, tarjetas y asistencias en tiempo real usando únicamente partidos FINALIZADO de la temporada en una instantánea RepeatableRead, sin caché ni operaciones de escritura.',
  })
  @ApiOkResponse({ type: ReporteDeportivoDto })
  @ApiBadRequestResponse({
    description: 'Identificador de temporada o parámetros inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({
    description: 'No tienes permiso para esta acción.',
  })
  @ApiNotFoundResponse({ description: 'La temporada no existe.' })
  @ApiInternalServerErrorResponse({
    description:
      'Error al consultar el reporte deportivo; no se devuelven cifras simuladas.',
  })
  consultar(
    @Param() { temporadaId }: TemporadaReporteDeportivoParamsDto,
    @Query() _query: SinParametrosReporteDeportivoDto,
    @Req() request: Request,
  ): Promise<ReporteDeportivoDto> {
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
    return this.reporte.consultar(temporadaId);
  }
}
