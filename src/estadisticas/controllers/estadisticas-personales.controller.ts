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
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  MisEstadisticasDto,
  SinParametrosEstadisticasDto,
  TemporadaEstadisticasParamsDto,
} from '../dto/estadisticas-personales.dto.js';
import { EstadisticasPersonalesService } from '../services/estadisticas-personales.service.js';

@ApiTags('estadísticas')
@ApiBearerAuth()
@Roles('JUGADOR')
@Controller('temporadas')
export class EstadisticasPersonalesController {
  constructor(private readonly estadisticas: EstadisticasPersonalesService) {}

  @Get(':temporadaId/mis-estadisticas')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({
    name: 'temporadaId',
    schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
  })
  @ApiOperation({
    summary:
      'Consulta las estadísticas oficiales acumuladas y por partido del jugador autenticado',
    description:
      'Resuelve la identidad desde la sesión. Exige ficha vinculada e inscripción confirmada en la temporada. Incluye únicamente partidos FINALIZADO.',
  })
  @ApiOkResponse({ type: MisEstadisticasDto })
  @ApiBadRequestResponse({
    description: 'Identificador de temporada o parámetros inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({
    description:
      'Rol distinto de JUGADOR, cuenta sin ficha vinculada o jugador no inscrito en la temporada.',
  })
  @ApiNotFoundResponse({ description: 'La temporada no existe.' })
  @ApiInternalServerErrorResponse({
    description: 'Error interno al consultar estadísticas.',
  })
  consultar(
    @Param() { temporadaId }: TemporadaEstadisticasParamsDto,
    @Query() _query: SinParametrosEstadisticasDto,
    @Req() request: Request,
    @CurrentUser() usuario: User,
  ): Promise<MisEstadisticasDto> {
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
    return this.estadisticas.consultar(temporadaId, usuario.id);
  }
}
